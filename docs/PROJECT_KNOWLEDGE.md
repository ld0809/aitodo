# AITodo 项目基本知识

> 最后更新：2026-05-15  
> 用途：给后续开发提供当前代码事实、业务规则和 UI 交互约定。开发前先读本文件；当代码架构、业务逻辑或 UI 交互发生变化时，必须同步更新。

## 1. 项目定位

AITodo 是一个聚合多来源待办的个人/协作任务管理系统。核心目标是把本地待办、共享卡片待办、TAPD 等外部系统待办集中展示，并结合用户目标、进度记录和 AI 能力生成阶段报告，降低漏办和偏离目标的风险。

当前仓库包含：
- `backend/`：NestJS + TypeScript API，使用 TypeORM + SQLite。
- `client/`：React + Vite 前端，使用 TanStack Query、Zustand 和自定义 UI。
- `miniapp/`：微信小程序相关代码。
- `plugins/`：OpenClaw 插件等扩展。
- `docs/`：产品、架构、部署、阶段文档和本知识库。

## 2. 后端架构

后端入口是 `backend/src/main.ts`：
- 全局前缀：`/api/v1`。
- 全局响应包装：成功响应统一为 `{ code: 0, message: 'ok', data }`。
- 全局校验：`ValidationPipe` 开启 `transform`、`whitelist`、`forbidNonWhitelisted`。
- 认证：除认证相关公开接口外，业务 controller 通过 `JwtAuthGuard` 保护。

模块边界：
- `auth`：注册、登录、邮箱验证码、JWT。
- `users`：当前用户资料、目标、密码。
- `tags`：用户标签。
- `todos`：本地待办、共享待办访问、完成状态、进度更新。
- `cards`：卡片配置、看板布局、归档、卡片级用户偏好、卡片待办拉取。
- `plugins`：数据源插件注册和执行，当前包含本地待办、TAPD、GitHub/Jira 适配雏形。
- `tapd`：TAPD 配置、查询、状态/人员选项、同源详情代理。
- `reports`：基于进度更新生成 AI 报告。
- `miniapp`：小程序绑定、首页查询、日历同步准备/确认。
- `organizations`：组织与成员管理，用于共享卡片参与人选择。
- `openclaw`：OpenClaw 绑定、WebSocket 通道、共享待办分发。

数据库实体统一登记在 `backend/src/database/entity-list.ts`。涉及实体结构变更时，必须同步添加 `backend/migrations/sql/*.sql` 迁移文件。

## 3. 核心数据模型

`User`
- 邮箱账号，包含 `nickname`、`avatarUrl`、`target`、`emailVerified`、`status`。
- 关联个人卡片、共享卡片、被分配待办、进度、小程序绑定、OpenClaw 绑定、组织。

`Tag`
- 属于单个用户。
- 可关联待办和卡片，用于本地待办筛选和卡片聚合。

`Todo`
- 本地持久化待办。字段包含 `content`、`dueAt`、`executeAt`、`status`、`completedAt`、`deletedAt`、`progressCount`。
- `status` 当前支持 `todo`、`done`、`completed`。
- 多对多关联 `tags` 和 `assignees`。
- 删除为软删除：设置 `deletedAt`。
- 共享卡片内创建待办时，会根据内容中的 `@成员` 自动解析 assignees。

`TodoProgressEntry`
- 待办进度记录，用于 AI 报告。
- 每新增一条进度，会递增待办上的 `progressCount`。

`Card`
- 看板卡片，字段包含 `name`、`cardType`、`status`、`sortBy`、`sortOrder`、布局 `x/y/w/h`、`pluginType`、`pluginConfigJson`。
- `cardType`：`personal` 或 `shared`。
- `status`：`active` 或 `archived`。
- `pluginType`：本地待办为 `local_todo`，TAPD 为 `tapd`。
- 共享卡片只支持 `local_todo`，不能使用外部插件。

`CardUserLayout`
- 用户级卡片布局和视图偏好。
- 唯一键：`cardId + userId`。
- `layoutsJson` 保存不同 viewport 的布局，viewport 包含 `mobile`、`tablet`、`desktop_normal`、`desktop_big`。
- `showCompletedTodos` 保存单个用户在单张卡片中是否显示已完成待办，刷新页面后恢复。

## 4. 业务规则

认证与用户：
- 登录后前端保存 `accessToken`，Axios 请求自动带 `Authorization: Bearer <token>`。
- 401 且本地存在 token 时，前端清理缓存和登录态并跳转 `/login`。
- 用户目标 `target` 展示在首页 header，用于 AI 报告语境。

待办：
- 普通本地待办只允许所有者删除。
- 共享待办可被卡片所有者、参与人、assignee 访问，具体权限以 `TodosService` 为准。
- 完成切换接口会把 `todo` 与 `done` 互转，并维护 `completedAt`。
- TAPD 待办不落本地库，不支持本地编辑、完成切换和进度更新。
- 本地待办可以通过 `cardId` 显式归属到某张 `local_todo` 卡片。显式归属优先于标签聚合：已设置 `cardId` 的待办只显示在目标卡片；未设置 `cardId` 的待办才按标签进入个人卡片。移动已有待办到共享卡片时保留待办自身标签。

卡片：
- 个人卡片可以关联标签，卡片内展示命中任一关联标签的本地待办；无标签时展示未归入其它规则的本地待办逻辑由 `client/src/lib/cardTodos.ts` 承担。
- 共享卡片可以配置参与人。参与人可以看到共享卡片以及与自己相关的共享待办。
- 共享卡片关联标签用于新建共享待办的默认标签；编辑共享待办时展示并保留待办自身标签，不用卡片当前关联标签覆盖。
- TAPD 卡片通过 `pluginConfigJson` 配置 workspace、内容类型、状态、迭代、人员等过滤条件；每次展示时实时从 TAPD 拉取。
- 归档只允许卡片所有者操作。参与人不能打开已归档共享卡片。
- 看板布局是用户维度数据，不直接修改共享卡片对其他人的布局。
- 卡片“显示/隐藏已完成待办”也是用户维度偏好，走 `PATCH /cards/:id/preferences`。

插件：
- `PluginExecutor` 根据 `card.pluginType` 从 registry 取插件。
- 插件负责 `validateConfig`、`fetchItems`、`sortItems`、`mapToCardView`。
- TAPD 插件把需求/缺陷映射为 `CardTodoView`，用状态标签前缀展示，并把外部状态规整为 `todo` 或 `completed`。

AI 报告：
- 先收集指定时间段内有进度更新的待办，再交给 AI 服务生成报告。
- 第三方 TAPD 待办没有本地进度，因此不进入本地进度报告数据源，除非未来明确新增同步/映射规则。

小程序与日历：
- 小程序用户必须绑定邮箱用户。
- 日历同步按设备维度记录同步状态，避免重复写入。
- 待办截止时间变更时，会清除对应同步记录，便于下次重新同步。

OpenClaw：
- 用户可绑定 OpenClaw。
- 共享卡片中分配给某用户的待办会被分发给该用户绑定的 OpenClaw。
- OpenClaw 回写方案/进展时进入待办进度记录。

## 5. 前端架构

入口：
- `client/src/App.tsx` 定义路由与鉴权守卫。
- `client/src/api/client.ts` 统一 Axios base URL、token 注入、响应解包和 401 处理。
- `client/src/lib/queryClient.ts` 提供全局 TanStack Query client。
- `client/src/store/authStore.ts` 保存认证态。

主要页面：
- `/`：官网/落地页。
- `/login`、`/register`、`/verify`：认证流程。
- `/dashboard`：核心首页。
- `/archived-cards`：归档卡片。
- `/tapd-config`、`/requirements`、`/bugs`、`/todo-query`：TAPD 和查询相关页面。
- `/settings/profile`、`/settings/organizations`：设置页。

主要组件：
- `Header`：顶部导航、目标展示、用户菜单、入口按钮。
- `TodoCard`：待办 item 展示、完成勾选、进度按钮、TAPD/共享元信息。
- `CardModal`：创建/编辑个人卡片、共享卡片、TAPD 卡片。
- `TodoModal`：创建/编辑待办。
- `ProgressModal`：追加进度。
- `TagModal`：标签管理。
- `components/ui/Button.tsx`：共享按钮组件。新增通用按钮样式优先扩展它。

## 6. 首页 UI 交互

首页支持两种视图：
- 卡片模式：Grafana 风格卡片看板，卡片可拖拽和纵向缩放。
- 列表模式：左侧筛选项，中间待办列表，右侧详情和进度。

卡片模式：
- 卡片 header hover/focus 后展示操作按钮。
- `+` 可在卡片下快速新建待办；只有 header hover/focus 时 header title 会变成快速输入框。
- 卡片完成状态按钮用于显示/隐藏已完成待办，状态保存到 server。
- 本地和共享卡片待办支持在卡片之间拖拽移动，拖放后更新待办 `cardId` 并刷新卡片数据；TAPD 只读待办不能拖拽移动。
- 卡片可打开编辑、归档、删除。归档/删除入口在更多菜单中。
- 本地/共享卡片待办可完成、编辑、追加进度。
- TAPD 卡片待办只读，点击可打开 TAPD 详情代理或原链接。
- 已完成待办隐藏后，卡片计数显示当前可见数量。

列表模式：
- 通过用户菜单“首页视图”切换。
- 视图模式存储在 localStorage：`aitodo:dashboard:view-mode`。
- 左侧筛选包含“全部”、标签、TAPD 卡片。
- 选中待办后右侧展示详情；本地待办可直接编辑内容、时间、标签和进度。
- TAPD 待办右侧优先展示同源详情 iframe，无法生成详情时提示打开原链接。

视觉约定：
- 全局设计 token 在 `client/src/index.css`。
- 避免在页面局部硬编码另一套 radius、颜色、阴影。
- 重复出现的 UI primitive 应放入 `client/src/components/ui`。
- 新按钮优先使用共享 `Button`，只有 icon-only 或历史局部按钮有明确理由时才使用局部样式。

## 7. API 约定速查

所有业务 API 实际前缀为 `/api/v1`，前端 Axios 默认解包 `data`。

常用接口：
- `GET /users/me`、`PATCH /users/me`、`PATCH /users/me/password`
- `GET /tags`、`POST /tags`、`PATCH /tags/:id`、`DELETE /tags/:id`
- `GET /todos`、`POST /todos`、`PATCH /todos/:id`、`PATCH /todos/:id/complete`、`DELETE /todos/:id`
- `GET /todos/:id/progress`、`POST /todos/:id/progress`
- `GET /cards?viewport=<viewport>&status=<active|archived>`
- `POST /cards`、`PATCH /cards/:id`、`DELETE /cards/:id`
- `PATCH /cards/:id/archive`
- `PATCH /cards/:id/layout`
- `PATCH /cards/:id/preferences`
- `PUT /dashboard/layout`
- `GET /cards/:id/todos`：返回卡片待办视图；本地/共享待办包含 `progressCount`，TAPD 待办保持外部只读字段。

## 8. 开发与测试约定

后端：
- 修改 API、DTO、service、实体后运行 `npm run typecheck`。
- 影响业务规则时补充 Jest 单元或 e2e 测试。
- 实体结构变更必须提供 SQL migration，并确认 `backend/src/database/entity-list.ts` 已包含新实体。

前端：
- 修改 UI 或数据流后运行 `npm run build`。
- 影响关键流程时补充或更新 Playwright 测试。
- 修改首页交互时重点检查桌面和窄屏布局、按钮文案溢出、浮层遮挡。

开发前：
- 先读本文件。
- 涉及某个模块时，再读对应 `controller/service/entity` 或 `page/component/api/type`。
- 如果本文件与代码冲突，以代码为准，并立即更新本文件。

## 9. 必须同步更新本文件的场景

以下变更完成后，必须更新本文件或说明无需更新的理由：
- 新增/删除后端模块、controller、核心 service。
- 新增/删除数据库实体字段、关系、迁移。
- 改变待办、卡片、共享、TAPD、AI 报告、小程序、OpenClaw 的业务规则。
- 改变 API 路径、请求/响应结构、鉴权规则。
- 改变首页核心交互、视图模式、卡片操作、列表详情行为。
- 新增或改变共享 UI primitive、设计 token、全局视觉规则。
