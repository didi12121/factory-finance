# Factory Finance

面向小型注塑加工工厂的轻量级财务管理系统，目标是替代现有 Excel 账目管理方式。核心产品原则：**用户负责录入真实业务，系统负责执行财务规则、生成凭证、计算余额及统计报表**。

当前处于 **Phase 0.1（Foundation & Design System）**：工程骨架、模块化单体基础架构、Design System、公共组件与测试基础设施。真实财务业务将在 Phase 1+ 逐步实现（见 `docs/DEVELOPMENT_ROADMAP.md`）。开发约束见 `AGENTS.md`，架构与规则文档见 `docs/`。

## 技术栈一览（实际锁定版本）

| 层 | 技术 | 版本 |
| --- | --- | --- |
| 后端 | Java / Spring Boot / Maven | 21 / 3.5.16 |
| 后端 | MyBatis-Plus（spring-boot3 starter） | 3.5.18 |
| 后端 | MySQL / Flyway（flyway-core + flyway-mysql，Boot BOM 管理） | 8（镜像 mysql:8.4）/ 11.7.2 |
| 后端 | Spring Security / JWT（jjwt） | BOM 管理 / 0.12.7 |
| 后端 | OpenAPI（springdoc-openapi-starter-webmvc-ui） | 2.10.1 |
| 后端 | JUnit 5 / Testcontainers | BOM 管理 / 1.21.4 |
| 前端 | Vue / Vue Router / Pinia | 3.5.46 / 4.6.5 / 3.0.4 |
| 前端 | Vite / TypeScript（strict） | 7.3.8 / 5.9.3 |
| 前端 | Tailwind CSS（@tailwindcss/vite，CSS-first @theme） | 4.3.5 |
| 前端 | shadcn/vue 本地化实现（reka-ui + tailwind-merge + class-variance-authority） | 2.11.0 / 3.7.1 / 0.7.1 |
| 前端 | TanStack Table（@tanstack/vue-table） | 8.21.3 |
| 前端 | Lucide Icons（@lucide/vue） | 1.81.0 |
| 前端 | ECharts / Axios | 6.1.0 / 1.21.1 |
| 前端 | 字体（@fontsource-variable/inter、@fontsource/noto-sans-sc，本地 npm 分发） | 5.3.0 / 5.3.1 |
| 前端 | Vitest / Playwright | 4.1.12 / 1.65.1 |
| 基础设施 | Docker Compose / Nginx / 本地文件存储接口抽象 | — |

## 目录结构

```text
factory-finance/
├── AGENTS.md               # 开发约束（所有 Agent 必读）
├── README.md
├── .env.example            # 环境变量示例（真实密码/Secret 不提交）
├── docker-compose.yml      # MySQL + 后端 + 前端/Nginx
├── docs/
│   ├── ARCHITECTURE.md     # 模块化单体架构与模块边界
│   ├── REQUIREMENTS.md     # 需求与范围
│   ├── DATABASE_DESIGN.md  # 核心实体草案（未验收）
│   ├── ACCOUNTING_RULES.md # 财务规则（强制红线）
│   ├── DESIGN_SYSTEM.md    # Design Tokens 与组件清单
│   ├── UI_GUIDELINES.md    # UI 强制规范与禁止事项
│   ├── API_CONTRACT.md     # 统一响应/错误码/分页/认证设计
│   ├── DEVELOPMENT_ROADMAP.md
│   ├── DECISION_LOG.md
│   ├── references/
│   └── reviews/
├── backend/                # Spring Boot 模块化单体（Java 21）
│   └── src/main/java/com/factoryfinance/
│       ├── bootstrap/ common/ infrastructure/
│       └── modules/（identity/masterdata/treasury/receivable/payable/expense/
│           shareholder/fixedasset/accounting/reporting/attachment/audit）
├── frontend/               # Vue 3 + Vite（TypeScript strict）
│   └── src/（app/assets/components/{ui,shared,finance,layout}/
│       composables/features/layouts/router/services/stores/styles/types/utils/views）
├── deploy/nginx/           # Nginx 配置（代理 /api、SPA 回退）
├── scripts/
└── artifacts/screenshots/  # Playwright 真实浏览器截图输出
```

## 本地开发运行

### 环境准备

- **JDK 21**：设置 `JAVA_HOME` 指向 JDK 21 安装目录（或将 `bin` 加入 `PATH`）。
- **Maven**：无需全局安装，使用仓库内置 Maven Wrapper（`backend/mvnw` / `mvnw.cmd`，Maven 3.9.11）。
- **Node.js**：`^22.22.2 || >=24.15.0`（`frontend/.nvmrc`），npm 随 Node 安装。

PowerShell 中临时设置 JAVA_HOME（仅当前会话，路径按本机实际安装位置填写）：

```powershell
$env:JAVA_HOME = '<JDK 21 安装目录>'
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
java -version
```

### 1. 启动本地 MySQL（后端依赖）

本地直跑后端需要一个 MySQL 8 实例，可只启动 Compose 中的 MySQL：

```powershell
copy .env.example .env       # 首次：按需修改 .env 中的密码
docker compose up -d mysql
```

`application-dev.yml` 默认连接 `jdbc:mysql://127.0.0.1:3306/factory_finance`，用户名 `factory`，开发占位密码 `factory_dev_password`（可经 `DB_URL` / `DB_USERNAME` / `DB_PASSWORD` 环境变量覆盖）。`.env` 中的 `MYSQL_PASSWORD` 需与之对应，或改为一致的值。

### 2. 启动后端（8080）

Maven Wrapper（`backend/mvnw` / `mvnw.cmd`）已内置 Maven 3.9.11，无需全局安装 Maven；脚本基于 `JAVA_HOME` / `PATH` 探测 JDK 21：

```powershell
# Windows
powershell -ExecutionPolicy Bypass -File scripts\dev-backend.ps1
```

```bash
# Linux / macOS
./scripts/dev-backend.sh
```

等价命令：`backend\mvnw.cmd -f backend/pom.xml spring-boot:run`（或 `./backend/mvnw ...`）。

健康检查：`GET http://localhost:8080/api/v1/health`（其余业务接口当前未实现，未认证返回 401）。

### 3. 启动前端（5173）

Node.js 版本要求：`^22.22.2 || >=24.15.0`（见 `frontend/.nvmrc` 与 `package.json` engines）。

```bash
cd frontend
npm install
npm run dev        # Linux/macOS 也可用 ./scripts/dev-frontend.sh
```

- Dev server：`http://localhost:5173`
- Vite 已配置代理：`/api` → `http://localhost:8080`
- Design System 展示页：`http://localhost:5173/dev/design-system`（仅开发/测试环境）

## Docker Compose 运行

```powershell
copy .env.example .env          # 1. 复制并按需修改（必须设置 MYSQL_ROOT_PASSWORD / MYSQL_PASSWORD / JWT_SECRET）
docker compose up -d --build    # 2. 构建并启动 MySQL + 后端 + 前端
```

- 访问入口：**http://localhost:8088**（Nginx 提供前端静态资源，`/api` 反向代理到 backend:8080，支持 SPA 路由刷新）
- 后端直连：`http://127.0.0.1:${BACKEND_PORT:-8080}`（容器内部固定 8080，宿主机映射端口由 `.env` 的 `BACKEND_PORT` 配置）；MySQL：`127.0.0.1:3306`（仅绑定本机回环）
- 各服务带健康检查（mysqladmin ping / actuator/health / wget），Compose 按健康状态编排启动顺序
- 停止：`docker compose down`（数据卷 `mysql-data` 保留；彻底清空数据才使用 `docker compose down -v`）

## 数据库初始化

**无需手工建表**：Flyway 在应用启动时自动执行 `backend/src/main/resources/db/migration/` 下的迁移脚本（`validate-on-migrate`；`baseline-on-migrate` 默认**关闭**，已有非空 schema 的数据库须人工审核迁移历史后再启用）。

- 当前 `V1__init.sql` 仅为迁移基线（Phase 0.1 不创建业务表）。
- 业务表结构为草案（`docs/DATABASE_DESIGN.md`），经架构师审核后在 Phase 1+ 的迁移脚本中创建。
- 禁止在迁移脚本中执行任何破坏性初始化（DROP DATABASE / TRUNCATE 等）。

## 测试命令

一键运行（后端 + 前端 + E2E + 生产构建防护）：

```powershell
# Windows
powershell -ExecutionPolicy Bypass -File scripts\run-tests.ps1
```

```bash
# Linux / macOS
./scripts/run-tests.sh
```

后端（Maven Wrapper，需 JDK 21）：

```bash
backend/mvnw -f backend/pom.xml test      # 单元测试
backend/mvnw -f backend/pom.xml verify    # 含集成测试（Testcontainers 需要 Docker）
```

集成测试使用 Testcontainers 1.21.4 启动 `mysql:8.4` 容器验证 Flyway 迁移、MySQL 连接、健康检查与安全策略，**运行前需确保 Docker 服务可用**。

前端：

```bash
cd frontend
npm test              # Vitest 单元测试（金额格式化/校验、组件行为、路由布局等）
npm run test:e2e      # Playwright 真实浏览器端到端测试 + 截图
npm run test:e2e:prod # 生产构建防护（/dev/design-system 不可用）
```

CI：`.github/workflows/ci.yml` 覆盖后端单测/集成测试、前端类型检查/单测/生产构建、Playwright E2E 与截图 artifacts、Docker Compose 配置校验。

## 截图生成

`npm run test:e2e`（在 `frontend/` 目录）会构建测试模式产物、启动真实应用并用真实浏览器执行验证，截图输出到：

```text
artifacts/screenshots/phase-0.1.1/
├── shell-1920x1080.png
├── shell-1440x900.png
├── shell-1280x800.png
├── shell-mobile-390x844.png
├── design-system.png
├── data-table.png
├── data-table-empty.png
├── financial-metric.png
├── financial-status.png
├── dialog.png
└── detail-sheet.png
```

截图必须来自真实运行的应用（禁止生成式图片或效果图冒充）；视觉回归基线在人工审核通过后固化。

## 安全说明

- **不提交真实密码与 Secret**：`.env` 仅在本地创建（`.gitignore` 已排除），仓库只保留 `.env.example` 占位值。
- 生产/部署环境的数据库密码与 `JWT_SECRET`（≥32 字节随机串）仅通过环境变量注入（见 `application-docker.yml`），代码与配置文件中不得硬编码。
- **数据库端口仅绑定 `127.0.0.1`**（`docker-compose.yml`），不暴露公网；后端与前端端口同样只绑定本机回环。
- 本阶段不提供正式认证体系；除 `/api/v1/health` 外的接口默认返回 401（禁止伪造 JWT 或放行业务接口）。
