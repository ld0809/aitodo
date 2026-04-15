import { randomUUID } from "node:crypto";
import { resolveAccount, listAccountIds, inspectAccount, isConfigured, isEnabled, describeAccount, disabledReason, unconfiguredReason, applyAccountConfig, setAccountEnabled, deleteAccount, buildChannelConfigSchema, DEFAULT_ACCOUNT_ID } from "./account.js";
import { resolveRoutingPeerId } from "./routing.js";
import { extractResultText } from "./result.js";
import { runtimeStore } from "./runtime-store.js";
import { createChannelPluginBase } from "openclaw/plugin-sdk/core";

const accountControllers = new Map();
const accountRunQueues = new Map();

function buildConnectionUrl(account) {
  const url = new URL(account.url);
  url.searchParams.set("token", account.token);
  if (account.deviceName) {
    url.searchParams.set("deviceLabel", account.deviceName);
  }
  return url.toString();
}

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    const onAbort = () => {
      cleanup();
      reject(new Error("aborted"));
    };

    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener?.("abort", onAbort);
    };

    signal?.addEventListener?.("abort", onAbort, { once: true });
  });
}

function waitForSocketOpen(socket, signal) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      socket.removeEventListener("open", handleOpen);
      socket.removeEventListener("error", handleError);
      socket.removeEventListener("close", handleClose);
      signal?.removeEventListener?.("abort", handleAbort);
    };

    const handleOpen = () => {
      cleanup();
      resolve();
    };

    const handleError = (event) => {
      cleanup();
      reject(event?.error ?? new Error("websocket open failed"));
    };

    const handleClose = () => {
      cleanup();
      reject(new Error("websocket closed before open"));
    };

    const handleAbort = () => {
      cleanup();
      try {
        socket.close();
      } catch {
        // Ignore close errors during abort.
      }
      reject(new Error("aborted"));
    };

    socket.addEventListener("open", handleOpen, { once: true });
    socket.addEventListener("error", handleError, { once: true });
    socket.addEventListener("close", handleClose, { once: true });
    signal?.addEventListener?.("abort", handleAbort, { once: true });
  });
}

function createAccountController() {
  return {
    socket: null,
    activeDispatches: new Set(),
  };
}

function queueDispatchRun(sessionKey, work) {
  const previous = accountRunQueues.get(sessionKey) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(work)
    .finally(() => {
      if (accountRunQueues.get(sessionKey) === next) {
        accountRunQueues.delete(sessionKey);
      }
    });
  accountRunQueues.set(sessionKey, next);
  return next;
}

function updateStatus(ctx, patch) {
  const current = ctx.getStatus();
  ctx.setStatus({
    ...current,
    ...patch,
  });
}

function buildRunPrompt(payload) {
  const lines = [];
  if (typeof payload?.task?.message === "string" && payload.task.message.trim()) {
    lines.push(payload.task.message.trim());
  }
  if (typeof payload?.callbackUrl === "string" && payload.callbackUrl.trim()) {
    lines.push("");
    lines.push(`回传说明：本次运行完成后，结果会由 AITodo channel 自动回传到 ${payload.callbackUrl.trim()}，不要调用 message 工具对外发送。`);
  }
  return lines.join("\n");
}

function parseModelRef(modelRef) {
  if (typeof modelRef !== "string") {
    return null;
  }

  const normalized = modelRef.trim();
  const separatorIndex = normalized.indexOf("/");
  if (!normalized || separatorIndex <= 0 || separatorIndex >= normalized.length - 1) {
    return null;
  }

  return {
    provider: normalized.slice(0, separatorIndex),
    model: normalized.slice(separatorIndex + 1),
  };
}

async function runDispatch(ctx, account, payload) {
  const channelRuntime = ctx.channelRuntime;
  if (!channelRuntime) {
    throw new Error("AITodo channel runtime is unavailable");
  }
  const pluginRuntime = runtimeStore.getRuntime();
  const agentRuntime = pluginRuntime.agent;

  const routePeerId = resolveRoutingPeerId(account, payload);
  const route = channelRuntime.routing.resolveAgentRoute({
    cfg: ctx.cfg,
    channel: "aitodo",
    accountId: account.accountId,
    peer: {
      kind: "direct",
      id: routePeerId,
    },
  });

  const storePath = agentRuntime.session.resolveStorePath(ctx.cfg.session?.store, { agentId: route.agentId });
  const agentDir = agentRuntime.resolveAgentDir(ctx.cfg, route.agentId);
  const workspaceDir = agentRuntime.resolveAgentWorkspaceDir(ctx.cfg, route.agentId);
  await agentRuntime.ensureAgentWorkspace({ dir: workspaceDir });

  const sessionStore = agentRuntime.session.loadSessionStore(storePath);
  const now = Date.now();
  let sessionEntry = sessionStore[route.sessionKey];
  if (!sessionEntry) {
    sessionEntry = {
      sessionId: randomUUID(),
      updatedAt: now,
    };
    sessionStore[route.sessionKey] = sessionEntry;
    await agentRuntime.session.saveSessionStore(storePath, sessionStore);
  }

  const sessionId = typeof sessionEntry.sessionId === "string" && sessionEntry.sessionId.trim()
    ? sessionEntry.sessionId
    : randomUUID();
  if (sessionId !== sessionEntry.sessionId) {
    sessionEntry.sessionId = sessionId;
    sessionEntry.updatedAt = now;
    sessionStore[route.sessionKey] = sessionEntry;
    await agentRuntime.session.saveSessionStore(storePath, sessionStore);
  }

  const sessionFile = agentRuntime.session.resolveSessionFilePath(sessionId, sessionEntry, { agentId: route.agentId });
  const timeoutSeconds = Number.isFinite(payload?.timeoutSeconds) ? Number(payload.timeoutSeconds) : NaN;
  const timeoutMs = Number.isFinite(timeoutSeconds) && timeoutSeconds > 0
    ? Math.floor(timeoutSeconds * 1000)
    : account.runTimeoutFallbackMs;
  const configuredModel = route.agentId === "main"
    ? ctx.cfg?.agents?.defaults?.model?.primary
    : (Array.isArray(ctx.cfg?.agents?.list)
      ? ctx.cfg.agents.list.find((item) => item?.id === route.agentId)?.model
      : undefined);
  const parsedModel = parseModelRef(configuredModel);

  const runResult = await agentRuntime.runEmbeddedPiAgent({
    sessionId,
    sessionKey: route.sessionKey,
    agentId: route.agentId,
    messageChannel: "aitodo",
    messageProvider: "aitodo",
    agentAccountId: account.accountId,
    trigger: "manual",
    sessionFile,
    workspaceDir,
    agentDir,
    config: ctx.cfg,
    prompt: buildRunPrompt(payload),
    provider: parsedModel?.provider,
    model: parsedModel?.model,
    disableMessageTool: true,
    requireExplicitMessageTarget: true,
    timeoutMs,
    runId: randomUUID(),
  });

  const resultText = extractResultText(runResult);
  if (!resultText) {
    throw new Error("AITodo dispatch finished without a textual result");
  }

  return {
    route,
    resultText,
    runResult,
  };
}

function sendSocketMessage(socket, payload) {
  socket.send(JSON.stringify(payload));
}

async function handleDispatch(ctx, account, controller, payload) {
  const dispatchId = typeof payload?.dispatchId === "string" ? payload.dispatchId.trim() : "";
  if (!dispatchId || controller.activeDispatches.has(dispatchId)) {
    return;
  }

  controller.activeDispatches.add(dispatchId);
  updateStatus(ctx, {
    busy: true,
    activeRuns: (ctx.getStatus().activeRuns ?? 0) + 1,
    lastInboundAt: Date.now(),
    lastEventAt: Date.now(),
  });

  const routePeerId = resolveRoutingPeerId(account, payload);
  const queueKey = `${account.accountId}:${routePeerId}`;

  try {
    const { resultText } = await queueDispatchRun(queueKey, () => runDispatch(ctx, account, payload));
    if (controller.socket && controller.socket.readyState === WebSocket.OPEN) {
      sendSocketMessage(controller.socket, {
        type: "dispatch.result",
        dispatchId,
        result: {
          text: resultText,
        },
      });
    }
    updateStatus(ctx, {
      lastOutboundAt: Date.now(),
      lastMessageAt: Date.now(),
      lastError: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AITodo dispatch failed";
    if (controller.socket && controller.socket.readyState === WebSocket.OPEN) {
      sendSocketMessage(controller.socket, {
        type: "dispatch.failed",
        dispatchId,
        reason: message,
      });
    }
    updateStatus(ctx, {
      lastError: message,
      lastOutboundAt: Date.now(),
    });
  } finally {
    controller.activeDispatches.delete(dispatchId);
    updateStatus(ctx, {
      activeRuns: Math.max(0, (ctx.getStatus().activeRuns ?? 1) - 1),
      busy: controller.activeDispatches.size > 0,
      lastEventAt: Date.now(),
    });
  }
}

async function startSocketLoop(ctx) {
  const account = ctx.account;
  const controller = accountControllers.get(account.accountId) ?? createAccountController();
  accountControllers.set(account.accountId, controller);
  ctx.log?.info?.(`aitodo startAccount: account=${account.accountId} enabled=${isEnabled(account)} configured=${isConfigured(account)} url=${account.url ?? ""}`);

  let reconnectDelayMs = account.reconnectBaseMs;
  updateStatus(ctx, {
    running: true,
    connected: false,
    configured: isConfigured(account),
    enabled: isEnabled(account),
    lastStartAt: Date.now(),
    healthState: isConfigured(account) ? "connecting" : "unconfigured",
  });

  while (!ctx.abortSignal.aborted) {
    try {
      if (!isConfigured(account) || !isEnabled(account)) {
        ctx.log?.warn?.(`aitodo account skipped: account=${account.accountId} enabled=${isEnabled(account)} configured=${isConfigured(account)}`);
        updateStatus(ctx, {
          running: false,
          connected: false,
          healthState: isConfigured(account) ? "disabled" : "unconfigured",
        });
        return;
      }

      ctx.log?.info?.(`aitodo websocket connecting: account=${account.accountId} url=${account.url ?? ""}`);
      const socket = new WebSocket(buildConnectionUrl(account));
      controller.socket = socket;
      await waitForSocketOpen(socket, ctx.abortSignal);
      ctx.log?.info?.(`aitodo websocket connected: account=${account.accountId}`);

      updateStatus(ctx, {
        running: true,
        connected: true,
        healthState: "connected",
        lastConnectedAt: Date.now(),
        lastError: null,
      });

      sendSocketMessage(socket, {
        type: "hello",
        deviceLabel: account.deviceName,
      });

      reconnectDelayMs = account.reconnectBaseMs;
      const heartbeat = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          sendSocketMessage(socket, {
            type: "ping",
            at: new Date().toISOString(),
          });
        }
      }, account.heartbeatIntervalMs);

      await new Promise((resolve, reject) => {
        const cleanup = () => {
          clearInterval(heartbeat);
          socket.removeEventListener("message", onMessage);
          socket.removeEventListener("close", onClose);
          socket.removeEventListener("error", onError);
          ctx.abortSignal.removeEventListener("abort", onAbort);
        };

        const onMessage = (event) => {
          const text = typeof event.data === "string" ? event.data : Buffer.from(event.data).toString("utf8");
          let message;
          try {
            message = JSON.parse(text);
          } catch {
            updateStatus(ctx, {
              lastError: "AITodo websocket message must be valid JSON",
              lastEventAt: Date.now(),
            });
            return;
          }

          const type = typeof message?.type === "string" ? message.type : "";
          if (type === "dispatch.todo") {
            void handleDispatch(ctx, account, controller, message);
            return;
          }
          if (type === "aitodo.connected" || type === "hello.ack" || type === "pong" || type === "dispatch.ack") {
            updateStatus(ctx, {
              lastEventAt: Date.now(),
              lastError: null,
            });
            return;
          }
          if (type === "aitodo.error") {
            updateStatus(ctx, {
              lastError: typeof message?.error === "string" ? message.error : "AITodo plugin error",
              lastEventAt: Date.now(),
            });
          }
        };

        const onClose = () => {
          cleanup();
          resolve();
        };

        const onError = (event) => {
          cleanup();
          reject(event?.error ?? new Error("AITodo websocket error"));
        };

        const onAbort = () => {
          cleanup();
          try {
            socket.close();
          } catch {
            // Ignore close errors during abort.
          }
          resolve();
        };

        socket.addEventListener("message", onMessage);
        socket.addEventListener("close", onClose, { once: true });
        socket.addEventListener("error", onError, { once: true });
        ctx.abortSignal.addEventListener("abort", onAbort, { once: true });
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "AITodo websocket connect failed";
      ctx.log?.error?.(`aitodo websocket error: account=${account.accountId} error=${message}`);
      updateStatus(ctx, {
        connected: false,
        healthState: "disconnected",
        lastError: message,
        lastDisconnect: {
          at: Date.now(),
          error: message,
        },
      });
    } finally {
      if (controller.socket) {
        try {
          controller.socket.close();
        } catch {
          // Ignore close errors while reconnecting.
        }
      }
      controller.socket = null;
    }

    if (ctx.abortSignal.aborted) {
      break;
    }

    await delay(reconnectDelayMs, ctx.abortSignal).catch(() => undefined);
    reconnectDelayMs = Math.min(account.reconnectMaxMs, reconnectDelayMs * 2);
  }

  updateStatus(ctx, {
    running: false,
    connected: false,
    healthState: "stopped",
  });
}

const basePlugin = createChannelPluginBase({
  id: "aitodo",
  meta: {
    id: "aitodo",
    label: "AITodo",
    selectionLabel: "AITodo",
    detailLabel: "AITodo Assistant",
    docsPath: "/channels/channel-routing",
    docsLabel: "channel-routing",
    blurb: "Connect OpenClaw to AITodo shared todo dispatches.",
    order: 95,
  },
  capabilities: {
    chatTypes: ["direct"],
  },
  configSchema: buildChannelConfigSchema(),
  config: {
    listAccountIds,
    resolveAccount,
    inspectAccount,
    defaultAccountId: () => DEFAULT_ACCOUNT_ID,
    setAccountEnabled,
    deleteAccount,
    isConfigured,
    isEnabled,
    disabledReason,
    unconfiguredReason,
    describeAccount,
  },
  setup: {
    resolveAccountId: () => DEFAULT_ACCOUNT_ID,
    applyAccountConfig,
  },
});

export const aitodoPlugin = {
  ...basePlugin,
  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      configured: false,
      enabled: false,
      running: false,
      connected: false,
      healthState: "unconfigured",
    },
    buildAccountSnapshot: ({ account, runtime }) => ({
      ...describeAccount(account),
      ...runtime,
      accountId: DEFAULT_ACCOUNT_ID,
    }),
  },
  gateway: {
    startAccount: async (ctx) => {
      await startSocketLoop(ctx);
    },
    stopAccount: async (ctx) => {
      const controller = accountControllers.get(ctx.accountId);
      if (controller?.socket) {
        try {
          controller.socket.close();
        } catch {
          // Ignore close errors while stopping the account.
        }
      }
      updateStatus(ctx, {
        running: false,
        connected: false,
        healthState: "stopped",
      });
    },
  },
};
