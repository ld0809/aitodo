# AITodo OpenClaw Channel

本地 OpenClaw 的 `aitodo` channel 插件。

## 安装方式

### 方式一：本地仓库直接安装

适合本地开发、同仓库联调，不需要先发布插件：

```bash
openclaw plugins install --link /Volumes/external/code/nodejs/todo_manager_openclaw_cc_mm/plugins/openclaw-channel-aitodo
openclaw plugins enable aitodo
openclaw daemon restart
```

### 方式二：发布后按包名安装

适合给其他机器或正式环境使用。推荐发布到 npm registry：

- 公网分发：发布到 npm
- 内部使用：发布到 GitHub Packages / 私有 npm registry

发布后，服务端引导里的 `pluginPackageName` 和 `pluginInstallCommand` 应配置成实际包名与安装命令，例如：

```bash
openclaw plugins install @ld0809/openclaw-channel-aitodo
openclaw daemon restart
```

如果当前没有发布到 registry，就不要在使用引导里写包名安装，改成上面的本地路径安装。

不要同时保留“本地 `--link` 安装”和“npm 包安装”两份 `aitodo` 插件，否则 OpenClaw 会提示 duplicate plugin id，并按当前配置覆盖其中一份。

## 配置

单账号兼容写法：

```bash
openclaw config set channels.aitodo '{"enabled":true,"url":"ws://127.0.0.1:3002/api/v1/openclaw/ws","token":"<connect-token>","deviceName":"aitodo-local"}' --strict-json
```

推荐的多账号写法是固定使用同一个 channel `aitodo`，再通过 `accounts.<accountId>` 区分环境：

```bash
openclaw config set channels.aitodo '{
  "defaultAccount":"local",
  "accounts":{
    "local":{
      "enabled":true,
      "url":"ws://127.0.0.1:3002/api/v1/openclaw/ws",
      "token":"<local-connect-token>",
      "deviceName":"aitodo-local"
    },
    "prod":{
      "enabled":true,
      "url":"wss://aitodo.example.com/api/v1/openclaw/ws",
      "token":"<prod-connect-token>",
      "deviceName":"aitodo-prod"
    }
  }
}' --strict-json
```

不要新增 `aitodo_local` / `aitodo_prod` 这样的 channel id，插件只声明了一个 channel：`aitodo`。

更多可选字段可以写在 `~/.openclaw/openclaw.json` 的：

- 旧版单账号：`channels.aitodo`
- 多账号：`channels.aitodo.accounts.<accountId>`

可选字段包括：

- `routingPeerTemplate`: 默认 `{serverSessionKey}`，可改成 `aitodo:card:{cardId}` 以卡片维度聚合会话
- `rules`: 规则数组，可按 `cardId` / `todoId` / `sessionKey` / `dispatchId` 选择不同的 `routingPeerTemplate`
- `heartbeatIntervalMs`
- `reconnectBaseMs`
- `reconnectMaxMs`
- `runTimeoutFallbackMs`

多账号完整示例：

```json
{
  "channels": {
    "aitodo": {
      "defaultAccount": "local",
      "accounts": {
        "local": {
          "enabled": true,
          "url": "ws://127.0.0.1:3002/api/v1/openclaw/ws",
          "token": "<local-connect-token>",
          "deviceName": "aitodo-local",
          "routingPeerTemplate": "{serverSessionKey}",
          "rules": [
            {
              "field": "cardId",
              "pattern": "^shared-card-001$",
              "routingPeerTemplate": "aitodo:card:{cardId}"
            }
          ]
        },
        "prod": {
          "enabled": true,
          "url": "wss://aitodo.example.com/api/v1/openclaw/ws",
          "token": "<prod-connect-token>",
          "deviceName": "aitodo-prod"
        }
      }
    }
  }
}
```

## 路由样例

### 1. 默认：按 todoId 隔离 session

不需要额外配置，默认 `routingPeerTemplate` 是 `{serverSessionKey}`，效果等同于：

```json
{
  "channels": {
    "aitodo": {
      "routingPeerTemplate": "{serverSessionKey}"
    }
  }
}
```

这会把不同 todo 路由到不同 session，例如：

- `agent:main:aitodo:direct:aitodo:todo:<todoId>`

### 2. 按 cardId 聚合到同一个 agent/session

如果同一个共享卡片下的多个 todo 希望复用同一上下文，可改成：

```json
{
  "channels": {
    "aitodo": {
      "routingPeerTemplate": "aitodo:card:{cardId}"
    }
  }
}
```

这样同一张卡片下的 todo 会落到同一个 peer/session。

### 3. 指定 cardId 路由到不同 agent

分两层配置：

第一层，在 `channels.aitodo.rules` 里把特定 `cardId` 映射成稳定 peer：

```json
{
  "channels": {
    "aitodo": {
      "routingPeerTemplate": "{serverSessionKey}",
      "rules": [
        {
          "field": "cardId",
          "pattern": "^shared-card-arch$",
          "routingPeerTemplate": "aitodo:card:{cardId}"
        },
        {
          "field": "cardId",
          "pattern": "^shared-card-pm$",
          "routingPeerTemplate": "aitodo:card:{cardId}"
        }
      ]
    }
  }
}
```

第二层，在 OpenClaw 顶层 `bindings` 里按 peer 绑定到不同 agent：

```json
{
  "bindings": [
    {
      "match": {
        "channel": "aitodo",
        "peer": { "kind": "direct", "id": "aitodo:card:shared-card-arch" }
      },
      "agentId": "architect"
    },
    {
      "match": {
        "channel": "aitodo",
        "peer": { "kind": "direct", "id": "aitodo:card:shared-card-pm" }
      },
      "agentId": "pm"
    }
  ]
}
```

这样：

- `shared-card-arch` 下的任务会进 `architect`
- `shared-card-pm` 下的任务会进 `pm`
- 其他未命中的卡片仍按默认路由走

## 运行方式

- 插件建立到 AITodo 后端的长连接
- 收到 `dispatch.todo` 后，根据 `routingPeerTemplate` 生成 OpenClaw peer id
- 复用 OpenClaw 内置 `resolveAgentRoute(...)`，把任务路由到对应 agent/session
- 使用嵌入式 agent 运行任务，并通过 `dispatch.result` / `dispatch.failed` 回传
