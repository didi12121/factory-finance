# 生产部署说明（MVP）

> 适用范围：单机 Docker Compose 部署（MySQL 8.4 + Spring Boot 后端 + Nginx 前端）。
> 已在 Windows 11 + Docker 29.4.3 / Compose v5.1.3 实测通过（见 `docs/reviews/MVP_DELIVERY_REPORT.md`）。

---

## 1. 前置条件

- Docker Engine ≥ 24 与 Compose v2（`docker compose version` 可用）
- 磁盘 ≥ 5GB（镜像 + 数据卷）
- 宿主机端口：`MYSQL_PORT`(默认 3306)、`BACKEND_PORT`(8080)、`FRONTEND_PORT`(8088) 未被占用

## 2. 准备环境变量（必需）

```bash
cp .env.example .env
# 编辑 .env —— 以下 4 项必须替换为真实随机值，禁止使用示例值上线
```

| 变量 | 说明 |
| --- | --- |
| `MYSQL_ROOT_PASSWORD` | MySQL root 密码（仅容器内部使用） |
| `MYSQL_PASSWORD` / `DB_PASSWORD` | 应用数据库密码（两者保持一致） |
| `JWT_SECRET` | JWT 签名密钥，≥ 32 字节随机字符串 |
| `ADMIN_INITIAL_PASSWORD` | admin 初始密码，≥ 8 位；**首次启动时用于初始化管理员** |

其余可选：`MYSQL_DATABASE`（默认 factory_finance）、`MYSQL_USER`（默认 factory）、
`BACKEND_PORT` / `FRONTEND_PORT` / `MYSQL_PORT`、`SPRING_PROFILES_ACTIVE`（默认 docker）。

`APP_CORS_ALLOWED_ORIGINS`（可选）：浏览器允许来源，逗号分隔。默认覆盖 `http://localhost:<FRONTEND_PORT>` 与
`http://127.0.0.1:<FRONTEND_PORT>`。**用局域网 IP 或自定义域名访问时必须显式加入**，例如
`APP_CORS_ALLOWED_ORIGINS=http://192.168.1.10:8088`。

> 安全提示：`.env` 不得提交到 Git（已在 `.gitignore`）；生产环境建议使用密钥管理或 `docker secret` 注入。

## 3. 启动

```bash
docker compose up -d --build        # 首次构建镜像并启动
docker compose ps                   # 三个容器应为 healthy
docker compose logs -f backend      # 观察 Flyway 迁移与启动日志
```

启动顺序由健康检查保证：`mysql(healthy) → backend(healthy) → frontend`。

首次启动会自动执行 Flyway 迁移（V1–V5），并创建管理员账号 `admin`（密码为 `ADMIN_INITIAL_PASSWORD`）。

## 4. 验证清单

```bash
# 1) 后端健康
curl -fsS http://127.0.0.1:8080/api/v1/health

# 2) 前端与反向代理（同一入口）
curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8088/

# 3) 管理员登录（返回 accessToken 即成功）
curl -sS -X POST http://127.0.0.1:8088/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"<ADMIN_INITIAL_PASSWORD>"}'
```

浏览器打开 `http://<host>:8088` → 使用 `admin` 与初始密码登录 → **立即修改密码**（系统设置）。

## 5. 数据备份与恢复

```bash
# 备份（一致性快照，建议每日 + 升级前）
docker compose exec -T mysql mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" \
  --single-transaction --routines factory_finance > backup-$(date +%F).sql

# 恢复（先停止写入，恢复后重启后端）
docker compose stop backend
docker compose exec -T mysql mysql -uroot -p"$MYSQL_ROOT_PASSWORD" factory_finance < backup-YYYY-MM-DD.sql
docker compose start backend
```

> 恢复后用「数据迁移 → 导入核对」页面核对账户余额、应收/应付余额与导入统计，确认与备份前一致。

## 6. 升级（含新增 Flyway 迁移）

```bash
git pull
docker compose build backend frontend
docker compose up -d          # 后端启动时自动执行未应用的迁移
docker compose ps && docker compose logs -f backend
```

迁移只允许新增（`V6__…`），**禁止修改已执行的历史迁移文件**（Flyway `validate-on-migrate=true` 会校验失败）。

## 7. Excel 数据迁移

入口：登录后左侧导航「数据迁移」（`/business/import`）。

1. 选择模板 → 下载 `.xlsx`（客户/供应商/股东/资金账户/出资/支出/应收/回款，共 8 类）；
2. 按「填写说明」填写（金额两位小数、日期 `YYYY-MM-DD`、月份 `YYYY-MM`）→ 上传；
3. 预览：逐行显示「可导入 / 校验失败（原因）/ 重复（跳过）」；
4. 确认导入：逐行调用真实业务服务，生成业务单据与资金流水；结果面板显示成功/失败/重复行数；
5. 批次记录与「导入核对」：账户余额、总资金、客户应收、供应商应付、导入统计与差异提示。

导入建议顺序：客户/供应商/股东 → 资金账户（期初余额）→ 出资/支出 → 应收 → 回款。
上传上限 10MB（Nginx `client_max_body_size 12m`，后端 multipart 12MB）。

## 8. 常见问题

| 现象 | 处理 |
| --- | --- |
| 后端容器反复重启 | 查看 `docker compose logs backend`；常见为 `ADMIN_INITIAL_PASSWORD`/`JWT_SECRET` 缺失或占位值 |
| 端口被占用 | 修改 `.env` 中 `BACKEND_PORT` / `FRONTEND_PORT`（容器内端口固定 8080/80） |
| 登录提示用户名或密码错误 | 确认 `ADMIN_INITIAL_PASSWORD`（仅首次启动生效；修改环境变量不会重置已有密码） |
| 登录/保存时提示「网络请求失败」（Network Error） | 浏览器 POST 会携带 `Origin`，若反向代理未透传带端口的 `Host`，后端会把同源请求判为跨域并返回 403（空响应体）→ 前端显示网络错误。已通过 `proxy_set_header Host $http_host` + `X-Forwarded-Host` 修复；如用**局域网 IP / 自定义域名**访问，还需把该来源加入 `APP_CORS_ALLOWED_ORIGINS`（见 §2） |
| 导入报「模板不匹配」 | 必须使用下载的模板且表头不可改动；新增列需更新模板版本 |
| 导入报「期初日期」相关错误 | 资金流水日期不得早于账户期初日期；先导期初账户，再导历史流水 |
