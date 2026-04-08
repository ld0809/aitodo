# AI待办 小程序端（第六阶段）

## 当前实现范围
- 启动路由守卫：
  - 无 token -> 邮箱登录/注册页
  - 已登录未绑定 -> 绑定页
  - 已绑定 -> 首页
- 邮箱登录/注册流程：
  - 注册 -> 发送验证码 -> 验证 -> 自动登录
- 绑定流程：
  - 邮箱用户就绪后，点击“授权并绑定”
- 首页：
  - 标签抽屉（含“全部”固定项）
  - 右下角悬浮新建待办
  - 待办列表排序规则：
    1. 有截止时间优先，按截止时间升序
    2. 无截止时间在后，按创建时间倒序
  - 同步按钮：调用后端 prepare/confirm 接口做去重同步
- 待办编辑页：
  - 新建/编辑待办内容、标签、截止时间

## 目录结构
- `app.*`: 小程序入口
- `pages/launch`: 启动页 + 路由判断
- `pages/email-auth`: 邮箱登录/注册/验证码
- `pages/bind`: 小程序账号绑定
- `pages/home`: 标签抽屉、待办列表、同步结果抽屉
- `pages/todo-editor`: 新建/编辑待办
- `utils/request.js`: 请求封装
- `utils/auth.js`: 认证与绑定接口
- `utils/todo.js`: 待办与同步接口

## 本地运行
1. 用微信开发者工具打开 `miniapp/` 目录。
2. 在开发者工具里勾选“不校验合法域名”（开发阶段）。
3. 确保后端服务已启动（默认 `http://127.0.0.1:3002`）。
4. 若需改后端地址，可在小程序控制台执行：
   - `wx.setStorageSync('api_base_url', 'http://你的地址:3002/api/v1')`

## 小程序自动 E2E（miniprogram-automator）
1. 安装依赖：
   - `cd miniapp && npm install`
2. 配置微信开发者工具 CLI 路径（示例为 macOS）：
   - `export WECHAT_WEB_DEVTOOLS_CLI=\"/Applications/wechatwebdevtools.app/Contents/MacOS/cli\"`
3. 可选：指定项目目录（默认当前 `miniapp`）：
   - `export MINIAPP_PROJECT_PATH=\"/Volumes/external/code/nodejs/todo_manager_openclaw_cc_mm/miniapp\"`
4. 运行测试：
   - `npm run test:e2e`

当前自动化用例文件：
- `miniapp/e2e/phase6-miniapp.e2e.spec.js`

## 注意事项
- 小程序与后端联调默认走 `app.globalData.apiBaseUrl`。
- 绑定逻辑已使用后端 `POST /miniapp/wechat/bind-by-code`，由后端完成 `wx.login code -> openid` 兑换。
- 日历写入使用 `wx.addPhoneCalendar`，需先授权 `scope.addPhoneCalendar`，并传 Unix 时间戳形式的 `startTime/endTime`。
- 若基础库、设备或系统权限不支持写入手机日历，会在同步结果中显示失败原因。

后端环境变量（见 `backend/.env.example`）：
- `WECHAT_MINIAPP_APP_ID`
- `WECHAT_MINIAPP_APP_SECRET`
- `WECHAT_MINIAPP_JSCODE2SESSION_URL`
- `MINIAPP_WECHAT_MOCK_ENABLED`（仅本地测试）

## 后续建议
- 补充后端微信 code 换 openId 接口，替换临时绑定标识。
- 标签排序持久化到服务端，支持跨设备保持。
- 增加小程序端自动化测试（关键流程回归）。
