# 项目目标
我想实现一个AI待办项目，
核心是帮用户管理来自不同渠道的待办信息（比如群里at的、口头传达的、项目管理工具记录的（可以通过api拉取，我目前使用的tapd）），
通过让用户设置自己的岗位角色以及目标（公司目标、部门目标）结合AI分析能够给用户推荐任务优先级，
以此来确保待办不会漏、方向不会偏。
最后可以通过AI输出指定时间段的总结报告。
注意
1. 实现时要保存好需求文档、技术文档，
2. 数据库的话可以先用轻量的sqlite，
3. 界面我希望是跟grafana那样的卡片一样，不同的卡片展示不同类型的待办，能够拖动改变卡片的大小，这样用户可以尽量让所有待办在一个屏幕内展示出来
4. 前端使用react框架，后端使用nestjs框架
5. 按阶段实现项目需求，第一阶段验收通过后再开启第二阶段
6. 对于后台接口，请编写基于接口的集成测试进行测试
7. 对于前端页面，请使用playwright进行e2e测试（包括界面元素确认、console log确认）
8. 所有生成的代码都要先执行静态代码检查（eslint、typescript），确保没有语法错误、类型错误等


# 项目阶段
## 第一阶段
### 目标
完成最小MVP，
### 需求
1. 基本的用户管理，包含登录、注册（使用邮箱+密码，邮箱需要验证码验证）
2. 基本的待办管理，包括新建、编辑、删除待办，待办属性包括：内容、标签、截止时间、执行时间（用于设置闹钟提醒）
3. 基本的卡片管理，包括新建、编辑、删除卡片，卡片属性包括：名称、关联数据的标签、排序方式
	a. 卡片后续会扩展从第三方系统拉取数据，此处要考虑好架构(推荐使用插件架构，后续对接不同的系统，开发不同的插件即可)，从第三方拉取时，需要配置的内容也是不固定的（由第三方决定），数据拉取和排序以及展示逻辑都需要定制开发
4. 卡片在首页看板上可以拖动改变大小和位置，类似grafana那种
5. 待办是展示在卡片里的，根据卡片的设置进行展示
6. 界面风格相对清新一些，让人看着不那么压抑和紧张
7. 

## 第二阶段
### 目标
完成第三方tapd数据的拉取
### 需求
1. 能够拉取指定项目（必选）、指定迭代、指定人员（多选）、指定状态的需求
2. 能够拉取指定项目（必选）、指定标题特征、指定版本、指定人员（多选）、指定状态的缺陷
3. 能够拉取指定人员的所有待办
4. 第三方拉取的数据不用存储到本地，每次展示都从第三方拉取

## 第三阶段
### 目标
实现AI报告（周报月报，可指定时间段）功能
### 需求
1. 针对每一个待办，追加更新进度描述的功能，
   1. 更新入口可以放到每个待办item的状态checkbox下面，这样能最大化的节省UI空间
   2. 这个入口展示时可以做成一个圆形的按钮，同时把已更新的进度条数展示在按钮里
   3. 点击这个按钮后，会弹出一个输入框，用户可以在输入框里输入进度描述
   4. 只有本地数据库里的待办才可以更新进度描述，第三方拉取（tapd）的待办不能更新进度描述
2. 追加AI周报月报功能
   1. 入口可以加到新建卡片按钮的右侧，叫“AI报告”
   2. 点击这个按钮后可以让用户选择时间段（默认是上周）
   3. 点击确认后，先收集在时间段内有进度更新的待办，然后将待办和进度内容交给AI模型，生成指定时间段的报告
   4. AI总结这个过程可以参考/Volumes/external/code/h5/e2e_test/tests/helpers/ai-client-iflow.js文件中的实现，调用iflow的sdk来完成这个任务

## 第四阶段
### 目标
实现多用户交互功能，让不同的用户可以共享一个卡片，卡片里跟当前用户相关（被@的用户）的待办会被展示出来
### 需求
1. 可以创建共享类型的卡片，在共享卡片内创建待办时，被@的用户会被自动添加到待办的assignee列表里
2. 当被@的用户拉取卡片列表时，会拉取到有@自己的待办的共享卡片，同时可以拉取到该共享卡片内@自己的待办
3. 共享待办同样具备进度更新功能
4. 可以针对共享卡片设置参与人员，支持以邮箱的方式添加，也支持从另一个共享卡片复制参与人员
5. 在共享卡片内，新建待办时，输入@后，会自动提示已添加的参与人员，选择人员后回车确认

## 第五阶段
### 目标
完成项目对外服务，特性包括：
1. 追加应用的官网介绍页面，介绍项目的功能特色，在右上角提供登录注册入口，点击跳转到已有的登录页面
   1. 页面的风格相对清新一些，让人看着不那么压抑和紧张
   2. 介绍特性包括：tapd同步、AI报告（周报月报）、多用户交互，本项目主打一个简单快捷
2. 将db文件从git仓库中移除，只保留代码文件和配置文件，db文件在本地继续保留
3. 将仓库推送到远端git@github.com:ld0809/aitodo.git项目，目前项目为空，可以直接拿本地代码推送覆盖
4. 部署项目到服务器，服务器环境是ubuntu
   1. 请先制定部署方案让我review一下

## 发布与数据库迁移（新增）

### 1. 本地生成 SQL 迁移文件

当 `backend/src/database/entities` 有结构变更时，可以先手动生成 SQL 文件并提交：

```bash
cd backend
npm run db:migration:generate -- --name <change_name>
```

如果要给历史上依赖 TypeORM `synchronize` 的结构补一份可追溯基线，可执行：

```bash
cd backend
npm run db:migration:generate -- --name schema_baseline --baseline
```

生成目录：`backend/migrations/sql/*.sql`

### 2. 本地执行迁移（可选）

```bash
cd backend
npm run db:migration:apply -- --db ./data/app.db
```

迁移记录表：`schema_migrations`

### 3. 一键发布（含数据库迁移）

根目录执行：

```bash
scripts/deploy-release.sh
```

发布脚本会自动完成：
1. 本地先检查 schema 是否存在未提交的结构变更
2. 如有变更，自动生成 `backend/migrations/sql/*.sql`
3. 自动将新生成的 migration 文件提交到 git，并推送到远端分支（默认 `main`）
4. 服务器创建新 release 目录并构建前后端
5. 执行 `backend/migrations/sql` 下未应用的 SQL
6. 切换 `/opt/aitodo/current` 软链并重启 PM2
7. 做健康检查，失败自动回滚到上一个 release

注意：
- 发布脚本只会自动提交新生成的 migration 文件
- 若本地已有 staged changes，发布脚本会中止，避免误把其他改动一起提交
- 可通过 `--migration-name <name>` 指定自动生成 migration 的名称，默认是 `auto_schema_update`

环境文件读取顺序：
1. 优先使用服务器备份配置目录中的文件，默认：
   - `/opt/aitodo/configs_backup/.env`
   - `/opt/aitodo/configs_backup/client.env.production`
   - `/opt/aitodo/configs_backup/client.env`
2. 若备份目录中不存在，再回退到上一个 release 里的环境文件

注意：
- 仓库中不要提交真实 `.env` 文件
- 请改用 `backend/.env.example`、`client/.env.example` 作为模板
- 你当前服务器的后端环境文件可放在 `/opt/aitodo/configs_backup/.env`

### 4. 仅重启线上服务

如果只是重启当前线上后端进程，不发布新代码，可在仓库根目录执行：

```bash
scripts/restart-production.sh
```

脚本会：
1. 通过 SSH 连接线上服务器
2. 执行 `pm2 restart aitodo-backend --update-env`
3. 执行 `pm2 save`
4. 轮询 `http://127.0.0.1:3002/api/v1/health`，确认服务恢复

常用参数：

```bash
scripts/restart-production.sh --dry-run
scripts/restart-production.sh --skip-health-check
scripts/restart-production.sh --host 118.89.115.242 --user ubuntu --pm2-app aitodo-backend
```

## 邮箱验证码发送配置（SMTP）

后端会在 `POST /auth/send-email-code` 真实发送验证码邮件。请在 `backend/.env`（以及线上 `backend/.env`）填写：

```env
SMTP_HOST=smtp.zoho.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_REQUIRE_TLS=false
SMTP_USER=your_account@your_domain.com
SMTP_PASS=your_smtp_password_or_app_password
SMTP_FROM="AI待办 <your_account@your_domain.com>"
SMTP_VERIFY_SUBJECT=【AI待办】邮箱验证码
```

验证码是否在接口中明文返回由 `AUTH_EXPOSE_VERIFY_CODE` 控制：
- `true`：返回 `debugVerificationCode/debugCode`
- `false`：不返回调试验证码

## 第六阶段
### 目标
完成微信小程序端开发，核心是能够将带有截止时间的待办加入到手机日历中，在对应的时间提醒用户

### 需求
1. 需要完成小程序用户和邮箱注册用户的绑定功能
2. 必须先有邮箱注册用户，才能绑定小程序用户，
   1. 进入后先引导用户邮箱登录或者注册，
   2. 邮箱用户ready后，再引导用户绑定小程序用户
3. 能够将待办的截止时间加入到手机日历中
4. 能够在对应的时间提醒用户有待办需要处理

#### 核心页面
##### 首页
- 展示指定标签的待办列表，注意移动端没有卡片的概念
- 右下角展示新建待办按钮（悬浮），
- 标题栏的左上角展示标签按钮，点击后从左侧滑出标签列表，用户可以在列表中选择不同的标签展示，
  - 标签列表第一个item，默认是“全部”，点击后展示全部待办
  - 标签列表支持拖动排序，“全部”不参与排序
  - 在标签列表的顶部展示工具栏，工具栏左边显示当前用户的昵称，右边展示“同步”按钮，点击后将带有截止日期的待办加入到手机日历中
##### 往日历同步待办逻辑
- 同步日历时要有去重机制，已经同步过的待办，不会再重复同步
- 在server端存储用户每一个设备的每一个待办是否同步了，同步过后的待办，不会再重复同步到
- 用户设备的标识使用wx.getSystemInfoSync()返回的 brand、model、screenWidth、screenHeight拼接，作为唯一标识
- 当待办中的截止时间发生变化时，清除该待办的同步记录，下次同步时会重新加入到日历中

## 第七阶段
### 目标
完成AI助理的接入，允许接入个人的openclaw，当有任务需要处理时，会自动调用openclaw来完成任务

### 特性包括：
- 允许用户绑定本地的openclaw，当有共享待办分配给自己时，会自动把待办的内容分发给openclaw来完成任务
- 在共享卡片中A at B后，B的openclaw会收到该条待办，并启动任务规划、拆解，完成方案设计
- 完成方案设计后，系统会将方案设计更新到该条待办的进度中，用户可以在待办中查看

### 技术要求：
- 如何绑定openclaw需要调研下openclaw的开放能力，按照通用的标准做法来实现

### 使用引导收尾

#### 1. 本地安装方式

当前仓库已经包含 OpenClaw 插件目录：

- `plugins/openclaw-channel-aitodo`

如果是本地开发或同仓库联调，不需要先发布插件，直接本地安装：

```bash
openclaw plugins install --link /Volumes/external/code/nodejs/todo_manager_openclaw_cc_mm/plugins/openclaw-channel-aitodo
openclaw plugins enable aitodo
openclaw daemon restart
```

然后写入 channel 配置：

```bash
openclaw config set channels.aitodo '{"enabled":true,"url":"ws://127.0.0.1:3002/api/v1/openclaw/ws","token":"<connect-token>","deviceName":"aitodo-local"}' --strict-json
```

说明：

- 这里使用 `openclaw config set channels.aitodo ...`，而不是 `openclaw channels add --channel aitodo ...`
- 这样与当前插件实现和联调方式保持一致
- 安装插件后需要执行一次 `openclaw daemon restart`，让 Gateway 重新加载插件
- 不要同时保留“本地 `--link` 安装”和“npm 包安装”两份 `aitodo` 插件，否则会出现 duplicate plugin id 警告

#### 2. 根据 `cardId` 路由到不同 agent / session

AITodo 插件分两层做路由：

1. `channels.aitodo.routingPeerTemplate / rules`
作用：
把 `todoId` / `cardId` 等字段转换成稳定的 OpenClaw peer id

2. OpenClaw 顶层 `bindings`
作用：
再把这个 peer id 绑定到具体 agent

##### 默认：按 todoId 隔离 session

默认行为等同于：

```json
{
  "channels": {
    "aitodo": {
      "routingPeerTemplate": "{serverSessionKey}"
    }
  }
}
```

这意味着每个 todo 一个 session。

##### 按 cardId 聚合同一个 session

如果同一卡片下多个 todo 希望共享同一个上下文：

```json
{
  "channels": {
    "aitodo": {
      "routingPeerTemplate": "aitodo:card:{cardId}"
    }
  }
}
```

##### 指定 `cardId` 路由到不同 agent

先在 channel 侧把特定卡片映射成稳定 peer：

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

再在 OpenClaw 顶层 `bindings` 里绑定 agent：

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

#### 3. 插件是否需要发布

分两种情况：

- 本地开发 / 同仓库联调：不需要发布，直接 `openclaw plugins install --link <local-path>`
- 给其他机器或正式环境使用：建议发布到 npm registry

推荐做法：

- 公网分发：发布到 npm
- 内部环境：发布到 GitHub Packages 或私有 npm registry

保持和使用引导一致的原则是：

- 如果还没有发布，就在引导里写本地路径安装
- 如果已经发布，就把后端环境里的 `OPENCLAW_PLUGIN_PACKAGE_NAME` 与 `OPENCLAW_PLUGIN_INSTALL_COMMAND_TEMPLATE` 改成实际发布方式

例如发布到 npm 后，可配置成：

```env
OPENCLAW_PLUGIN_PACKAGE_NAME=@ld0809/openclaw-channel-aitodo
OPENCLAW_PLUGIN_INSTALL_COMMAND_TEMPLATE=openclaw plugins install {{pluginPackageName}}
```

而本地联调时，建议直接按本地路径安装，不依赖包发布；正式按包名安装后，同样建议执行一次 `openclaw daemon restart`。

# 第八阶段
## 目标
优化共享卡片添加人员的体验
## 需求
1. 追加组织的概念，任何账号都可以创建组织，组织内可以有多个用户，用户可以加入多个组织
2. 组织创建人可以添加组织中的成员，直接添加邮箱即可，无需对方确认
3. 共享卡片在添加参与人员时，可以从组织内的成员中选择，也可以手动输入邮箱添加
4. 由于一个人可以加入多个组织，所以从组织内添加参与人员时，需要先选择组织，再选择组织内的成员

# 第九阶段
## 目标
首页支持列表模式，类似小程序首页的待办列表展示
## 需求
1. 首页待办区域划分为3块，分别是“标签列表区域”、“待办列表区域”、“待办详情区域”
2. 标签列表区域展示所有标签，点击后展示该标签下的待办
3. 标签列表第一个item显示“全部”，点击后展示全部待办
4. 待办详情区域展示待办的详情（编辑模式）和进度列表（可以新增进度）

## 辅助信息
如果需要测试，请使用以下账号（可以任意增删改查），不要新注册账号
### 本地测试账号
- lid@fxiaoke.com 密码：Daxiang0809
- 邮箱：test1@fxiaoke.com 密码：My123456
- 邮箱：test2@fxiaoke.com 密码：My123456
- 邮箱：test4@fxiaoke.com 密码：My123456
### 生成环境测试账号
- 邮箱：test1@fxiaoke.com 密码：My123456
- 邮箱：test2@fxiaoke.com 密码：My123456
