const DEFAULT_ACCOUNT_ID = "default";
const DEFAULT_ROUTING_PEER_TEMPLATE = "{serverSessionKey}";
const DEFAULT_HEARTBEAT_INTERVAL_MS = 20000;
const DEFAULT_RECONNECT_BASE_MS = 2000;
const DEFAULT_RECONNECT_MAX_MS = 30000;
const DEFAULT_TIMEOUT_FALLBACK_MS = 15 * 60 * 1000;

function cloneConfig(cfg) {
  return JSON.parse(JSON.stringify(cfg ?? {}));
}

function asNonEmptyString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asPositiveInteger(value, fallback) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return fallback;
}

function normalizeRule(rawRule) {
  if (!rawRule || typeof rawRule !== "object") {
    return null;
  }

  const field = asNonEmptyString(rawRule.field);
  const pattern = asNonEmptyString(rawRule.pattern);
  if (!field || !pattern) {
    return null;
  }

  return {
    field,
    pattern,
    routingPeerTemplate: asNonEmptyString(rawRule.routingPeerTemplate),
  };
}

export function getAitodoSection(cfg) {
  return (cfg?.channels && typeof cfg.channels === "object" ? cfg.channels.aitodo : null) ?? null;
}

export function listAccountIds(cfg) {
  return getAitodoSection(cfg) ? [DEFAULT_ACCOUNT_ID] : [];
}

export function resolveAccount(cfg, accountId = DEFAULT_ACCOUNT_ID) {
  const section = getAitodoSection(cfg) ?? {};
  const rules = Array.isArray(section.rules) ? section.rules.map(normalizeRule).filter(Boolean) : [];

  return {
    accountId,
    enabled: section.enabled !== false,
    url: asNonEmptyString(section.url),
    token: asNonEmptyString(section.token),
    deviceName: asNonEmptyString(section.deviceName),
    routingPeerTemplate: asNonEmptyString(section.routingPeerTemplate) ?? DEFAULT_ROUTING_PEER_TEMPLATE,
    rules,
    heartbeatIntervalMs: asPositiveInteger(section.heartbeatIntervalMs, DEFAULT_HEARTBEAT_INTERVAL_MS),
    reconnectBaseMs: asPositiveInteger(section.reconnectBaseMs, DEFAULT_RECONNECT_BASE_MS),
    reconnectMaxMs: asPositiveInteger(section.reconnectMaxMs, DEFAULT_RECONNECT_MAX_MS),
    runTimeoutFallbackMs: asPositiveInteger(section.runTimeoutFallbackMs, DEFAULT_TIMEOUT_FALLBACK_MS),
  };
}

export function inspectAccount(cfg) {
  const section = getAitodoSection(cfg);
  const account = resolveAccount(cfg);
  const configured = Boolean(account.url && account.token);
  return {
    configured,
    enabled: section ? section.enabled !== false : false,
    tokenStatus: account.token ? "available" : "missing",
    urlStatus: account.url ? "available" : "missing",
    routingPeerTemplate: account.routingPeerTemplate,
  };
}

export function isConfigured(account) {
  return Boolean(account.url && account.token);
}

export function isEnabled(account) {
  return account.enabled !== false;
}

export function describeAccount(account) {
  return {
    accountId: account.accountId,
    configured: isConfigured(account),
    enabled: isEnabled(account),
    connected: false,
    running: false,
    tokenStatus: account.token ? "available" : "missing",
    baseUrl: account.url ?? undefined,
    healthState: isConfigured(account) ? "configured" : "unconfigured",
  };
}

export function disabledReason() {
  return "disabled";
}

export function unconfiguredReason() {
  return "not linked";
}

export function applyAccountConfig({ cfg, input }) {
  const nextCfg = cloneConfig(cfg);
  const current = getAitodoSection(cfg) ?? {};
  nextCfg.channels = typeof nextCfg.channels === "object" && nextCfg.channels ? nextCfg.channels : {};
  nextCfg.channels.aitodo = {
    ...current,
    enabled: true,
    url: asNonEmptyString(input.url) ?? current.url ?? "",
    token: asNonEmptyString(input.token) ?? current.token ?? "",
    deviceName: asNonEmptyString(input.deviceName) ?? current.deviceName ?? "",
  };
  return nextCfg;
}

export function setAccountEnabled({ cfg, enabled }) {
  const nextCfg = cloneConfig(cfg);
  nextCfg.channels = typeof nextCfg.channels === "object" && nextCfg.channels ? nextCfg.channels : {};
  const current = getAitodoSection(cfg) ?? {};
  nextCfg.channels.aitodo = {
    ...current,
    enabled,
  };
  return nextCfg;
}

export function deleteAccount({ cfg }) {
  const nextCfg = cloneConfig(cfg);
  if (nextCfg.channels && typeof nextCfg.channels === "object") {
    delete nextCfg.channels.aitodo;
  }
  return nextCfg;
}

export function buildChannelConfigSchema() {
  return {
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: { type: "boolean" },
        url: { type: "string", minLength: 1 },
        token: { type: "string", minLength: 1 },
        deviceName: { type: "string", minLength: 1, maxLength: 100 },
        routingPeerTemplate: { type: "string", minLength: 1 },
        heartbeatIntervalMs: { type: "integer", minimum: 1000 },
        reconnectBaseMs: { type: "integer", minimum: 1000 },
        reconnectMaxMs: { type: "integer", minimum: 1000 },
        runTimeoutFallbackMs: { type: "integer", minimum: 1000 },
        rules: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              field: {
                type: "string",
                enum: ["cardId", "todoId", "sessionKey", "dispatchId"],
              },
              pattern: { type: "string", minLength: 1 },
              routingPeerTemplate: { type: "string", minLength: 1 },
            },
            required: ["field", "pattern"],
          },
        },
      },
    },
    uiHints: {
      url: {
        label: "AITodo WS URL",
        placeholder: "wss://aitodo.example.com/api/v1/openclaw/ws",
      },
      token: {
        label: "Connect Token",
        sensitive: true,
      },
      deviceName: {
        label: "Device Name",
        placeholder: "aitodo-macbook",
      },
      routingPeerTemplate: {
        label: "Routing Peer Template",
        help: "Use {serverSessionKey}, {todoId}, or {cardId} to reuse OpenClaw peer routing.",
      },
    },
  };
}

export {
  DEFAULT_ACCOUNT_ID,
  DEFAULT_HEARTBEAT_INTERVAL_MS,
  DEFAULT_RECONNECT_BASE_MS,
  DEFAULT_RECONNECT_MAX_MS,
  DEFAULT_ROUTING_PEER_TEMPLATE,
  DEFAULT_TIMEOUT_FALLBACK_MS,
};
