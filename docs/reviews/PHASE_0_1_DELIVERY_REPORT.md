# Phase 0.1 Delivery Report

> 生成时间：2026-11-26（Asia/Shanghai）｜交付人：开发 Agent

## 1. Status

**READY_FOR_REVIEW**

## 2. Implemented

- **工程骨架**：Monorepo（`backend/` / `frontend/` / `deploy/nginx/` / `scripts/` / `docs/` / `artifacts/screenshots/`），`.gitignore` / `.env.example` / `docker-compose.yml` 齐备。
- **后端**（Java 21 + Spring Boot 3.5.16 模块化单体）：
  - 统一基础设施：`ApiResponse` / `ErrorCode` / `PageQuery` / `PageResult` / `GlobalExceptionHandler` / `TraceIdFilter`（X-Trace-Id 透传 + MDC 日志）；
  - Spring Security 无状态安全基线（默认 401 JSON 统一响应，禁止伪造认证）、JWT 基础设施（jjwt 0.12.7 签发/解析/验签，生命周期 Phase 1）；
  - OpenAPI（springdoc，dev/test 启用）、Actuator Health、MyBatis-Plus（分页 + 防全表攻击拦截器）、Flyway 迁移机制（V1 基线）、MySQL 8 数据源、环境隔离（dev / docker profile）、`GET /api/v1/health` 健康检查；
  - 12 个业务模块边界（`package-info.java`）+ identity 接口设计（AuthApi + DTO，未发布路由）。
- **前端**（Vue 3.5.46 + TS strict + Vite 7.3.8）：
  - Design System Tokens（Tailwind 4 `@theme`，与 `docs/DESIGN_SYSTEM.md` 一致）、Inter + Noto Sans SC 本地字体分发；
  - UI 组件 14 类（Button/Input/Select/Checkbox/Dialog/Sheet/DropdownMenu/Tabs/Tooltip/Table/Skeleton/Separator/Badge/Toast）；
  - Shared 组件 11 类（PageHeader/PageToolbar/DataTable/TablePagination/SearchInput/FilterBar/EmptyState/ErrorState/LoadingState/ConfirmDialog/DetailSheet/FormField）；
  - Finance 组件 5 类（MoneyText/AmountInput/DocumentNumber/FinancialStatus/FinancialMetric）；
  - Application Shell（224px/56px 折叠侧边栏、Header 用户区域、移动端 390px 抽屉、Lucide 图标、未实现标记）；
  - `/dev/design-system` 展示页（仅开发/测试环境启用，虚构测试数据）；
  - 金额精确运算（BigInt 定点 `utils/decimal.ts`）、统一 API 客户端（`services/http.ts`）。
- **Docker Compose**：MySQL 8.4（持久卷 + 健康检查 + 仅绑定 127.0.0.1）+ 后端 + 前端/Nginx（/api 代理、SPA 回退），已实际构建并启动验证。
- **文档**：AGENTS.md、README.md、ARCHITECTURE、REQUIREMENTS、DATABASE_DESIGN（草案标注）、ACCOUNTING_RULES、DESIGN_SYSTEM、UI_GUIDELINES、API_CONTRACT、DEVELOPMENT_ROADMAP、DECISION_LOG。
- **测试**：后端 JUnit 5（单测 + Testcontainers 集成）、前端 Vitest、Playwright 真实浏览器（含 8 张截图）。

## 3. Architecture

模块化单体（Modular Monolith）：单 Spring Boot 应用 + 单 MySQL 8，按业务领域划分 12 模块
`identity / masterdata / treasury / receivable / payable / expense / shareholder / fixedasset / accounting / reporting / attachment / audit`
（包根 `com.factoryfinance.modules`，本阶段仅模块边界与 identity 接口设计）。

- 顶层包：`bootstrap`（启动）/ `common`（ApiResponse、ErrorCode、分页、异常、Trace）/ `infrastructure`（Security、JWT、MyBatis-Plus、OpenAPI、Health）/ `modules`。
- 模块依赖规则：业务模块只依赖 `common`/`infrastructure`；模块间只经对方 `api` 包接口协作；禁止跨模块直查表；事务边界在 application 层。
- 前端：`components/{ui,shared,finance,layout}` + `features` + `views` + `services` + `utils`，API 统一管理，公共逻辑不重复实现。
- 详见 `docs/ARCHITECTURE.md`。

## 4. Dependency Versions

| 后端 | 版本 | 前端 | 版本 |
| --- | --- | --- | --- |
| Java | 21 | Vue | 3.5.46 |
| Spring Boot | 3.5.16 | Vue Router | 4.6.5 |
| MyBatis-Plus | 3.5.18（+ mybatis-plus-jsqlparser 3.5.18） | Pinia | 3.0.4 |
| MySQL / Flyway | mysql:8.4 / 11.7.2（flyway-mysql，Boot BOM） | Vite / TypeScript | 7.3.8 / 5.9.3（strict） |
| Spring Security | 6.5.11（BOM） | Tailwind CSS | 4.3.5（@tailwindcss/vite） |
| jjwt | 0.12.7 | shadcn/vue（reka-ui/tailwind-merge/cva） | 2.11.0 / 3.7.1 / 0.7.1 |
| springdoc-openapi | 2.10.1 | TanStack Table | 8.21.3 |
| Testcontainers | 1.21.4 | Lucide（@lucide/vue） | 1.81.0 |
| JUnit | 5.12.2（BOM） | ECharts / Axios | 6.1.0 / 1.21.1 |
| — | — | Vitest / Playwright | 4.1.12 / 1.65.1 |
| — | — | 字体（fontsource inter / noto-sans-sc） | 5.3.0 / 5.3.1 |

Lockfile：`frontend/package-lock.json` 已提交；Maven 版本由 `spring-boot-starter-parent` BOM + 显式锁定共同约束。

## 5. Design System

- **Token**：Color（brand/text/background/surface/border/success/warning/danger 共 16 个）/ Typography（页面标题 24/600、区域标题 16/600、正文 14、表格 13、辅助 12、财务数字 28–32/600）/ Layout（Sidebar 224/56、Header 56、表格行 44、控件 36、圆角 6/8），全部定义于 `frontend/src/styles/tokens.css` 并映射 Tailwind `@theme`。
- **金额展示**：千分位、两位小数、右对齐、`tabular-nums`；MoneyText 验证 `0.00 / 1,850.39 / -1,850.39 / 1,000,000.00`；AmountInput 校验精度、拒绝科学计数法，BigInt 定点运算。
- **组件**：UI 14 + Shared 11 + Finance 5 全部实现并在 Showcase 页与测试中验证；DataTable 支持排序/分页/空态/加载态并预留服务端分页。
- **布局**：桌面优先，1920×1080 / 1440×900 / 1280×800 / 390×844 四断点验证；移动端侧边栏抽屉；表格容器内横向滚动，无页面级横向溢出（e2e 断言）。

## 6. Test Results

| 套件 | 命令 | 通过 | 失败 | 跳过 |
| --- | --- | --- | --- | --- |
| 后端单元测试（surefire） | `mvn test` | 16 | 0 | 0 |
| 后端集成测试（failsafe，Testcontainers） | `mvn verify` | 8 | 0 | 0 |
| 前端单元测试（Vitest） | `npm test` | 25 | 0 | 0 |
| 端到端（Playwright，真实 Chromium） | `npm run test:e2e` | 24 | 0 | 0 |
| 类型检查（vue-tsc strict） | `npm run type-check` | 通过 | 0 | — |

覆盖点：Context 启动、Health Check、参数校验、统一异常响应、基础安全策略（401 JSON）、Flyway 迁移及 MySQL 连接、金额格式化/输入精度、公共组件行为、路由及布局、Showcase 页面、Sidebar 折叠、导航、Dialog/DetailSheet、DataTable 排序分页、金额组件、键盘可访问性、移动端布局、无横向溢出。

Docker Compose 运行验证：`docker compose up -d --build` 后 mysql/backend 健康检查通过；`http://localhost:8088/api/v1/health` 返回统一成功响应；`/workbench` SPA 回退正常；未认证访问业务路径返回 401。

## 7. Screenshots

`artifacts/screenshots/phase-0.1/`（Playwright 真实浏览器生成）：

- shell-1920x1080.png / shell-1440x900.png / shell-1280x800.png / shell-mobile-390x844.png
- design-system.png / data-table.png / dialog.png / detail-sheet.png

Agent 已抽查其中 6 张（shell-1440x900、shell-mobile-390x844、design-system、data-table、dialog、detail-sheet），其余 2 张同页面不同视口。**最终视觉验收与视觉回归基线固化以架构师人工审核为准。**

## 8. Run Instructions

本地开发（详见 `README.md`）：

```powershell
# 后端（需 JDK 21 + MySQL 8，或先 docker compose up -d mysql）
powershell -ExecutionPolicy Bypass -File scripts\dev-backend.ps1    # http://localhost:8080
# 前端（/api 代理到 8080）
powershell -ExecutionPolicy Bypass -File scripts\dev-frontend.ps1   # http://localhost:5173
```

Docker Compose 一键启动：

```powershell
Copy-Item .env.example .env   # 按需修改，勿提交
docker compose up -d --build  # http://localhost:8088
docker compose down           # 停止
```

测试与截图：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\run-tests.ps1
# 或分别：mvn verify（需 Docker）/ npm test / npm run test:e2e
```

## 9. Architecture Decisions

新增决策详见 `docs/DECISION_LOG.md`（15 条），要点：

1. Spring Boot 3.5.16（任务强制 3.x，本地同版本已验证）。
2. Flyway MySQL 支持使用 `flyway-mysql` 11.7.2（Boot 3.5 BOM 管理的构件名；`flyway-database-mysql` 不在该 BOM 中）。
3. MyBatis-Plus 3.5.18 + 显式引入 `mybatis-plus-jsqlparser` 3.5.18（3.5.9+ 分页/防全表攻击拦截器拆分至该模块，依赖事实）。
4. Lucide 使用官方维持包 `@lucide/vue`（`lucide-vue-next` 已废弃）。
5. TanStack Table 选稳定 v8 线（8.21.3）。
6. Tailwind 4 CSS-first `@theme` 承载 Design Tokens；shadcn/vue 组件按官方组合（reka-ui + cva + tailwind-merge）本地化实现，不使用 CLI 生成。
7. 金额精确运算 BigInt 定点实现（`utils/decimal.ts`）。
8. dev 环境占位凭证放 `application-dev.yml`，生产凭证仅环境变量注入（`application-docker.yml`）。
9. Testcontainers 集成测试采用 `@ServiceConnection` + `@Bean` 容器单例（跨测试类共享缓存上下文）。

## 10. Known Issues

1. Flyway 启动警告："MySQL 8.4 is newer than this version of Flyway（11.7.2），latest supported 8.1"——迁移与校验在 MySQL 8.4 实测通过，仅版本提示；是否升级 Flyway 待架构师确认。
2. `jsdom@31` engine 声明要求 Node ≥24.15（本机 24.14.0）：npm 提示 EBADENGINE 警告，Vitest 全部通过；后续升级 Node 或 jsdom。
3. 视觉回归基线未固化，按任务要求待人工审核通过后再固化。
4. Playwright 测试机器人为单 worker 串行执行（保证截图与交互稳定性），耗时约 30 秒。
5. 业务 API 均未实现（默认 401），认证仅保留接口设计——按阶段计划执行，非缺陷。

## 11. Git

- 提交 Hash：`1d67cca5ca349e4ef8a44795c85b5e3ac7491bd5`（Phase 0.1 主提交，158 files / 11441 insertions）；本报告为随后的追加提交。
- 工作区状态：clean（`.env` 为本地开发文件已忽略，未提交任何真实密码/Secret）。
- 仓库为本阶段新建（root-commit），分支 `main`。

## 12. Scope Verification

```text
Phase 0.2 started = NO
Real financial business implemented = NO
Real financial data imported = NO
```

PHASE_0_1 = READY_FOR_REVIEW，停止开发，等待架构师与产品负责人审核。
