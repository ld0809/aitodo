const DEFAULT_ACCOUNT_ID = "default";
const DEFAULT_ROUTING_PEER_TEMPLATE = "{serverSessionKey}";
const DEFAULT_HEARTBEAT_INTERVAL_MS = 20000;
const DEFAULT_RECONNECT_BASE_MS = 2000;
const DEFAULT_RECONNECT_MAX_MS = 30000;
const DEFAULT_TIMEOUT_FALLBACK_MS = 15 * 60 * 1000;
const ACCOUNT_SCOPED_KEYS = [
  "name",
  "enabled",
  "url",
  "token",
  "deviceName",
  "routingPeerTemplate",
  "heartbeatIntervalMs",
  "reconnectBaseMs",
  "reconnectMaxMs",
  "runTimeoutFallbackMs",
  "rules",
];

function cloneConfig(cfg) {
  return JSON.parse(JSON.stringify(cfg ?? {}));
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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

function normalizeAccountId(accountId) {
  return asNonEmptyString(accountId) ?? DEFAULT_ACCOUNT_ID;
}

function buildAccountConfigSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      name: { type: "string", minLength: 1, maxLength: 100 },
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
  };
}

export function getAitodoSection(cfg) {
  return (cfg?.channels && typeof cfg.channels === "object" ? cfg.channels.aitodo : null) ?? null;
}

export function getAccountsSection(cfg) {
  const section = getAitodoSection(cfg);
  return isRecord(section?.accounts) ? section.accounts : null;
}

function hasLegacyAccountConfig(section) {
  return ACCOUNT_SCOPED_KEYS.some((key) => Object.prototype.hasOwnProperty.call(section ?? {}, key));
}

function extractScopedConfig(section) {
  const next = {};
  for (const key of ACCOUNT_SCOPED_KEYS) {
    if (Object.prototype.hasOwnProperty.call(section ?? {}, key)) {
      next[key] = section[key];
    }
  }
  return next;
}

function clearLegacyAccountConfig(section) {
  for (const key of ACCOUNT_SCOPED_KEYS) {
    delete section[key];
  }
  return section;
}

function sortAccountIds(accountIds) {
  return accountIds.toSorted((left, right) => {
    if (left === DEFAULT_ACCOUNT_ID) {
      return right === DEFAULT_ACCOUNT_ID ? 0 : -1;
    }
    if (right === DEFAULT_ACCOUNT_ID) {
      return 1;
    }
    return left.localeCompare(right);
  });
}

function getAccountEntry(section, accountId) {
  const normalizedAccountId = normalizeAccountId(accountId);
  const accounts = isRecord(section?.accounts) ? section.accounts : null;

  if (accounts && isRecord(accounts[normalizedAccountId])) {
    return {
      exists: true,
      mode: "accounts",
      section: accounts[normalizedAccountId],
    };
  }

  if (normalizedAccountId === DEFAULT_ACCOUNT_ID && hasLegacyAccountConfig(section)) {
    return {
      exists: true,
      mode: "legacy",
      section,
    };
  }

  return {
    exists: false,
    mode: accounts ? "accounts" : "legacy",
    section: null,
  };
}

function shouldUseAccountsMode(section, accountId) {
  return normalizeAccountId(accountId) !== DEFAULT_ACCOUNT_ID || isRecord(section?.accounts);
}

function migrateLegacyAccountToAccounts(section) {
  if (!isRecord(section)) {
    return {
      accounts: {},
    };
  }

  const nextSection = {
    ...section,
  };
  const accounts = isRecord(nextSection.accounts) ? { ...nextSection.accounts } : {};

  if (hasLegacyAccountConfig(nextSection) && !isRecord(accounts[DEFAULT_ACCOUNT_ID])) {
    accounts[DEFAULT_ACCOUNT_ID] = extractScopedConfig(nextSection);
  }

  nextSection.accounts = accounts;
  clearLegacyAccountConfig(nextSection);
  return nextSection;
}

function ensureChannelSection(cfg) {
  cfg.channels = isRecord(cfg.channels) ? cfg.channels : {};
  cfg.channels.aitodo = isRecord(cfg.channels.aitodo) ? cfg.channels.aitodo : {};
  return cfg.channels.aitodo;
}

function resolveConfiguredSection(cfg, accountId) {
  const section = getAitodoSection(cfg) ?? {};
  const normalizedAccountId = normalizeAccountId(accountId);
  const entry = getAccountEntry(section, normalizedAccountId);
  return {
    accountId: normalizedAccountId,
    exists: entry.exists,
    section: entry.section ?? {},
  };
}

export function listAccountIds(cfg) {
  const section = getAitodoSection(cfg);
  if (!isRecord(section)) {
    return [];
  }

  const accountIds = new Set();
  const accounts = getAccountsSection(cfg);
  if (accounts) {
    for (const accountId of Object.keys(accounts)) {
      accountIds.add(normalizeAccountId(accountId));
    }
  }
  if (hasLegacyAccountConfig(section)) {
    accountIds.add(DEFAULT_ACCOUNT_ID);
  }

  return sortAccountIds(Array.from(accountIds));
}

export function resolveDefaultAccountId(cfg) {
  const section = getAitodoSection(cfg);
  const configuredDefaultAccountId = asNonEmptyString(section?.defaultAccount);
  const accountIds = listAccountIds(cfg);
  if (configuredDefaultAccountId && accountIds.includes(configuredDefaultAccountId)) {
    return configuredDefaultAccountId;
  }
  return accountIds[0] ?? DEFAULT_ACCOUNT_ID;
}

export function resolveAccount(cfg, accountId = DEFAULT_ACCOUNT_ID) {
  const resolved = resolveConfiguredSection(cfg, accountId);
  const section = resolved.section;
  const rules = Array.isArray(section.rules) ? section.rules.map(normalizeRule).filter(Boolean) : [];

  return {
    accountId: resolved.accountId,
    name: asNonEmptyString(section.name),
    enabled: resolved.exists ? section.enabled !== false : false,
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

export function inspectAccount(cfg, accountId = DEFAULT_ACCOUNT_ID) {
  const section = getAitodoSection(cfg);
  const account = resolveAccount(cfg, accountId);
  const configured = Boolean(account.url && account.token);
  return {
    configured,
    enabled: section ? account.enabled !== false : false,
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
    name: account.name ?? undefined,
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

export function applyAccountName({ cfg, accountId, name }) {
  const resolvedAccountId = normalizeAccountId(accountId);
  const nextCfg = cloneConfig(cfg);
  let channel = ensureChannelSection(nextCfg);

  if (shouldUseAccountsMode(channel, resolvedAccountId)) {
    channel = migrateLegacyAccountToAccounts(channel);
    const accounts = isRecord(channel.accounts) ? { ...channel.accounts } : {};
    const current = isRecord(accounts[resolvedAccountId]) ? accounts[resolvedAccountId] : {};
    if (asNonEmptyString(name)) {
      accounts[resolvedAccountId] = {
        ...current,
        name: asNonEmptyString(name),
      };
    } else if (isRecord(current)) {
      const nextAccount = { ...current };
      delete nextAccount.name;
      accounts[resolvedAccountId] = nextAccount;
    }
    channel.accounts = accounts;
    nextCfg.channels.aitodo = channel;
    return nextCfg;
  }

  if (asNonEmptyString(name)) {
    channel.name = asNonEmptyString(name);
  } else {
    delete channel.name;
  }
  return nextCfg;
}

export function applyAccountConfig({ cfg, accountId, input }) {
  const resolvedAccountId = normalizeAccountId(accountId);
  const nextCfg = cloneConfig(cfg);
  let channel = ensureChannelSection(nextCfg);

  if (shouldUseAccountsMode(channel, resolvedAccountId)) {
    channel = migrateLegacyAccountToAccounts(channel);
    const accounts = isRecord(channel.accounts) ? { ...channel.accounts } : {};
    const current = isRecord(accounts[resolvedAccountId]) ? accounts[resolvedAccountId] : {};
    accounts[resolvedAccountId] = {
      ...current,
      enabled: true,
      ...(asNonEmptyString(input.name) ? { name: asNonEmptyString(input.name) } : {}),
      url: asNonEmptyString(input.url) ?? current.url ?? "",
      token: asNonEmptyString(input.token) ?? current.token ?? "",
      deviceName: asNonEmptyString(input.deviceName) ?? current.deviceName ?? "",
    };
    channel.accounts = accounts;
    nextCfg.channels.aitodo = channel;
    return nextCfg;
  }

  nextCfg.channels.aitodo = {
    ...channel,
    enabled: true,
    ...(asNonEmptyString(input.name) ? { name: asNonEmptyString(input.name) } : {}),
    url: asNonEmptyString(input.url) ?? channel.url ?? "",
    token: asNonEmptyString(input.token) ?? channel.token ?? "",
    deviceName: asNonEmptyString(input.deviceName) ?? channel.deviceName ?? "",
  };
  return nextCfg;
}

export function setAccountEnabled({ cfg, enabled, accountId = DEFAULT_ACCOUNT_ID }) {
  const resolvedAccountId = normalizeAccountId(accountId);
  const nextCfg = cloneConfig(cfg);
  let channel = ensureChannelSection(nextCfg);

  if (shouldUseAccountsMode(channel, resolvedAccountId)) {
    channel = migrateLegacyAccountToAccounts(channel);
    const accounts = isRecord(channel.accounts) ? { ...channel.accounts } : {};
    const current = isRecord(accounts[resolvedAccountId]) ? accounts[resolvedAccountId] : {};
    accounts[resolvedAccountId] = {
      ...current,
      enabled,
    };
    channel.accounts = accounts;
    nextCfg.channels.aitodo = channel;
    return nextCfg;
  }

  nextCfg.channels.aitodo = {
    ...channel,
    enabled,
  };
  return nextCfg;
}

export function deleteAccount({ cfg, accountId = DEFAULT_ACCOUNT_ID }) {
  const resolvedAccountId = normalizeAccountId(accountId);
  const nextCfg = cloneConfig(cfg);
  if (!isRecord(nextCfg.channels) || !isRecord(nextCfg.channels.aitodo)) {
    return nextCfg;
  }

  const channel = nextCfg.channels.aitodo;
  if (isRecord(channel.accounts)) {
    const accounts = { ...channel.accounts };
    delete accounts[resolvedAccountId];
    if (Object.keys(accounts).length > 0) {
      channel.accounts = accounts;
    } else {
      delete channel.accounts;
    }
    if (resolvedAccountId === DEFAULT_ACCOUNT_ID) {
      clearLegacyAccountConfig(channel);
    }
  } else if (resolvedAccountId === DEFAULT_ACCOUNT_ID) {
    delete nextCfg.channels.aitodo;
  }

  if (isRecord(nextCfg.channels.aitodo) && !hasLegacyAccountConfig(nextCfg.channels.aitodo) && !isRecord(nextCfg.channels.aitodo.accounts)) {
    delete nextCfg.channels.aitodo;
  }
  return nextCfg;
}

export function buildChannelConfigSchema() {
  const accountConfigSchema = buildAccountConfigSchema();
  return {
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        ...accountConfigSchema.properties,
        defaultAccount: { type: "string", minLength: 1 },
        accounts: {
          type: "object",
          additionalProperties: accountConfigSchema,
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
      accounts: {
        label: "Accounts",
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
  normalizeAccountId,
};
