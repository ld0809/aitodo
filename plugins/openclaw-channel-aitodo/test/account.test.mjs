import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_ACCOUNT_ID,
  applyAccountConfig,
  deleteAccount,
  inspectAccount,
  listAccountIds,
  resolveAccount,
  resolveDefaultAccountId,
  setAccountEnabled,
} from "../src/account.js";

test("legacy single-account config still resolves to default account", () => {
  const cfg = {
    channels: {
      aitodo: {
        enabled: true,
        url: "ws://127.0.0.1:3002/api/v1/openclaw/ws",
        token: "legacy-token",
        deviceName: "aitodo-local",
      },
    },
  };

  assert.deepEqual(listAccountIds(cfg), [DEFAULT_ACCOUNT_ID]);
  assert.equal(resolveDefaultAccountId(cfg), DEFAULT_ACCOUNT_ID);

  const account = resolveAccount(cfg);
  assert.equal(account.accountId, DEFAULT_ACCOUNT_ID);
  assert.equal(account.enabled, true);
  assert.equal(account.url, "ws://127.0.0.1:3002/api/v1/openclaw/ws");
  assert.equal(account.token, "legacy-token");

  assert.deepEqual(inspectAccount(cfg), {
    configured: true,
    enabled: true,
    tokenStatus: "available",
    urlStatus: "available",
    routingPeerTemplate: "{serverSessionKey}",
  });
});

test("adding a non-default account promotes legacy config into accounts.default", () => {
  const legacyCfg = {
    channels: {
      aitodo: {
        enabled: true,
        url: "ws://127.0.0.1:3002/api/v1/openclaw/ws",
        token: "legacy-token",
        deviceName: "aitodo-local",
      },
    },
  };

  const nextCfg = applyAccountConfig({
    cfg: legacyCfg,
    accountId: "prod",
    input: {
      url: "wss://prod.example.com/api/v1/openclaw/ws",
      token: "prod-token",
      deviceName: "aitodo-prod",
    },
  });

  assert.deepEqual(listAccountIds(nextCfg), ["default", "prod"]);
  assert.equal(nextCfg.channels.aitodo.url, undefined);
  assert.equal(nextCfg.channels.aitodo.token, undefined);
  assert.equal(nextCfg.channels.aitodo.deviceName, undefined);
  assert.equal(nextCfg.channels.aitodo.accounts.default.url, "ws://127.0.0.1:3002/api/v1/openclaw/ws");
  assert.equal(nextCfg.channels.aitodo.accounts.default.token, "legacy-token");
  assert.equal(nextCfg.channels.aitodo.accounts.prod.url, "wss://prod.example.com/api/v1/openclaw/ws");
  assert.equal(nextCfg.channels.aitodo.accounts.prod.token, "prod-token");
});

test("setAccountEnabled and deleteAccount operate on nested accounts", () => {
  const cfg = {
    channels: {
      aitodo: {
        accounts: {
          local: {
            enabled: true,
            url: "ws://127.0.0.1:3002/api/v1/openclaw/ws",
            token: "local-token",
          },
          prod: {
            enabled: true,
            url: "wss://prod.example.com/api/v1/openclaw/ws",
            token: "prod-token",
          },
        },
        defaultAccount: "prod",
      },
    },
  };

  const disabledCfg = setAccountEnabled({
    cfg,
    accountId: "prod",
    enabled: false,
  });

  assert.equal(resolveDefaultAccountId(disabledCfg), "prod");
  assert.equal(resolveAccount(disabledCfg, "prod").enabled, false);
  assert.equal(resolveAccount(disabledCfg, "local").enabled, true);

  const removedCfg = deleteAccount({
    cfg: disabledCfg,
    accountId: "prod",
  });

  assert.deepEqual(listAccountIds(removedCfg), ["local"]);
  assert.equal(resolveDefaultAccountId(removedCfg), "local");
  assert.equal(removedCfg.channels.aitodo.accounts.prod, undefined);
});
