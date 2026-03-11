# Phase 5 部署方案（待评审）

## 1. 目标与边界
- 目标服务器：`118.89.115.242`（Ubuntu）
- 对外提供：
  - 前端官网与应用页面（Vite 构建后的静态资源）
  - 后端 API（NestJS，前缀 `/api/v1`）
- 当前阶段先完成方案评审，不直接执行线上部署。

## 2. 总体架构
- `Nginx` 作为统一入口（80/443）：
  - `/` -> 前端静态资源目录
  - `/api/v1` -> 反向代理到后端 `127.0.0.1:3002`
- `PM2` 管理后端 Node 进程（开机自启、崩溃拉起、日志管理）
- 数据库继续使用本地 SQLite 文件（不进入 git）
- 备份继续使用已有 `backup-db.sh + crontab` 机制。

## 3. 发布目录建议
- 项目目录：`/opt/aitodo`
- 前端静态目录：`/opt/aitodo/client/dist`
- 后端运行目录：`/opt/aitodo/backend`
- 数据目录：`/opt/aitodo/backend/data`
- 日志目录：`/opt/aitodo/logs`

## 4. 环境准备
- 安装：`git`、`nodejs 20.x`、`npm`、`nginx`、`pm2`
- 创建运行用户（建议非 root，如 `deploy`）
- 开放防火墙端口：`80/443`（对外），`3002` 仅本机访问。

## 5. 配置项

### 5.1 后端 `.env`
- `PORT=3002`
- `NODE_ENV=production`
- `JWT_SECRET=<强随机密钥>`
- `DATABASE_PATH=/opt/aitodo/backend/data/app.db`
- `AI_REPORT_IFLOW_TIMEOUT_MS=300000`
- `AI_REPORT_IFLOW_LOG_LEVEL=ERROR`
- `CORS_ORIGINS=https://<你的域名>,http://118.89.115.242`

### 5.2 前端 `.env.production`
- `VITE_API_BASE_URL=/api/v1`

## 6. 部署步骤（草案）
1. 拉取代码到 `/opt/aitodo`。
2. 后端安装依赖并构建：
   - `cd backend && npm install && npm run build`
3. 前端安装依赖并构建：
   - `cd client && npm install && npm run build`
4. PM2 启动后端：
   - `pm2 start dist/main.js --name aitodo-backend --cwd /opt/aitodo/backend`
   - `pm2 save && pm2 startup`
5. Nginx 配置站点：
   - `root /opt/aitodo/client/dist`
   - `location /api/v1 { proxy_pass http://127.0.0.1:3002; ... }`
   - `location / { try_files $uri /index.html; }`
6. `nginx -t && systemctl reload nginx`
7. 验证：
   - `curl http://127.0.0.1:3002/api/v1/health`（如暂未实现 health，可改为任一可用 GET 接口）
   - 浏览器访问首页、登录、看板、AI 报告接口连通性。

## 7. 安全与稳定性
- DB 文件不进入仓库，仅保留在服务器本地目录并限制权限（`chmod 600`）。
- `JWT_SECRET`、第三方 token 仅保存在服务器 `.env`。
- Nginx + PM2 日志按天轮转（logrotate）。
- 定时备份保留 14 天（沿用当前策略）。

## 8. 回滚方案
- 保留最近 3 个发布目录（如 `/opt/aitodo/releases/<timestamp>`）。
- 回滚步骤：
  1. 切换软链接到上一个 release；
  2. `pm2 restart aitodo-backend`；
  3. `systemctl reload nginx`；
  4. 如涉及 DB 结构变更，按备份脚本执行恢复。

## 9. 评审确认点
- 是否使用域名 + HTTPS（推荐）还是先用 IP 访问。
- 是否需要新增 `/health` 探活接口（建议新增，便于监控）。
- 是否接受 `PM2 + Nginx` 方案（若偏好容器化，可改 Docker Compose）。
