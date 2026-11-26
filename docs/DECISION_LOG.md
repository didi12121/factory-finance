# Factory Finance — 决策记录（Decision Log）

> 所有重要架构决策必须记录于此（任务文档第 4 节）。格式：日期 / 决策 / 理由 / 影响 / 状态。

## 决策记录表

| 日期 | 决策 | 理由 | 影响 | 状态 |
| --- | --- | --- | --- | --- |
| 2026-11-26 | 后端采用 **Spring Boot 3.5.16**（`spring-boot-starter-parent` 3.5.16，Java 21） | 任务文档强制 Spring Boot 3.x；3.5.16 为本地环境已验证过的稳定补丁版（本地 `ruoyi_new` 项目同版本运行） | 锁定后端依赖基线（BOM 管理 Spring 生态构件版本） | 已确认 |
| 2026-11-26 | Flyway MySQL 支持使用 **`flyway-mysql` 11.7.2**（Boot 3.5 BOM 管理的构件名；`flyway-database-mysql` 不在 Boot 3.5 BOM 中） | Flyway 10+ 将数据库方言拆为独立构件；Boot 3.5.x BOM 管理的是 `flyway-mysql`，`flyway-database-mysql` 不在 Boot 3.5 BOM 中，需另行锁定版本，故选择 BOM 管理构件。**已记录为依赖事实** | `backend/pom.xml` 引入 `flyway-core` + `flyway-mysql`，版本由 Boot BOM 管理（11.7.2）；迁移脚本兼容 MySQL 8.4 | 已确认（依赖事实） |
| 2026-11-26 | 持久层采用 **MyBatis-Plus 3.5.18**（`mybatis-plus-spring-boot3-starter`） | 任务文档强制 MyBatis-Plus；`spring-boot3` starter 与 Boot 3.5 对齐；SQL 可控，适合财务查询 | Mapper/分页/乐观锁使用 MyBatis-Plus 能力；复杂报表 SQL 手写可控 | 已确认 |
| 2026-11-26 | 前端核心依赖锁定：**vue 3.5.46 / vue-router 4.6.5 / pinia 3.0.4 / vite 7.3.8** | 任务文档强制技术栈；选取相互兼容的稳定版本并提交 lockfile（`frontend/package-lock.json`） | 前端构建基线固定；升级需走决策流程 | 已确认 |
| 2026-11-26 | CSS 框架采用 **Tailwind CSS 4.3.5**（`@tailwindcss/vite` 4.3.5），**CSS-first `@theme` 映射设计 Token** | Tailwind 4 原生 CSS-first 主题方案，Design Tokens 直接定义在 `frontend/src/styles/tokens.css` 的 `@theme` 块，无需 JS 配置桥接；与 shadcn/vue 现行规范一致 | Token 值唯一来源为 tokens.css，`docs/DESIGN_SYSTEM.md` 与其保持一致；业务页面禁止散落十六进制颜色 | 已确认 |
| 2026-11-26 | 基础无头组件库采用 **reka-ui 2.11.0** | shadcn/vue 官方指定的无头组件基础库（Radix Vue 的更名/继任线），可访问性行为完善 | Dialog/Sheet/DropdownMenu/Tooltip/Tabs 等交互组件基于 reka-ui | 已确认 |
| 2026-11-26 | Lucide 图标使用官方维持包 **@lucide/vue 1.81.0**（`lucide-vue-next` 已废弃） | `lucide-vue-next` 已废弃，官方 Vue 包迁移至 `@lucide/vue`；避免引入废弃依赖 | 全部图标 import 自 `@lucide/vue`；禁止再引用 `lucide-vue-next` | 已确认 |
| 2026-11-26 | 表格引擎采用 **TanStack Table 8.21.3**（v8 稳定线） | v9 为新主版本（breaking changes、生态尚未稳定），选稳定 v8 线 | `DataTable` 基于 `@tanstack/vue-table` 8.x；升级 v9 需另行评估决策 | 已确认 |
| 2026-11-26 | **TypeScript 5.9.3 strict**，禁止 `any` 绕过核心类型检查 | 任务文档强制 strict；财务前端对类型安全敏感 | 构建含 `vue-tsc --noEmit` 类型检查门禁（`npm run build`） | 已确认 |
| 2026-11-26 | 金额字符串精确运算采用 **BigInt 定点实现**（`frontend/src/utils/decimal.ts`） | 任务文档禁止 JS Number 财务运算；BigInt 定点无浮点误差、无额外依赖 | 前端金额校验/运算输入输出均为十进制字符串；`AmountInput`/`MoneyText` 基于该模块 | 已确认 |
| 2026-11-26 | 后端 dev 环境使用**本地开发占位凭证**（`application-dev.yml`），生产凭证仅经环境变量注入（`application-docker.yml`） | 任务文档禁止提交真实密码/Secret、禁止硬编码生产数据库密码；dev 占位值便于本地起步 | `DB_URL`/`DB_USERNAME`/`DB_PASSWORD`/`JWT_SECRET` 均支持环境变量覆盖；docker 配置不含任何真实凭证 | 已确认 |
| 2026-11-26 | Docker 集成测试使用 **Testcontainers 1.21.4 + mysql:8.4** | 任务文档强制 Testcontainers；镜像版本与 Docker Compose 的 MySQL 8.4 一致，测试环境与运行环境同构 | `mvn verify` 需要本机 Docker；集成测试（Flyway/连接/安全策略）跑真实 MySQL | 已确认 |
| 2026-11-26 | shadcn/vue 组件采用 **reka-ui + tailwind-merge 3.7.1 + class-variance-authority 0.7.1** 按 shadcn/vue 规范**本地化实现**（无 CLI 生成） | shadcn/vue 官方约定的组合方式；CLI 生成会引入未锁定依赖与网络安装步骤，故手工本地化实现并锁定版本 | `components/ui/*` 全部为仓库内源码，可审计、可修改；依赖树无隐式新增 | 已确认 |
| 2026-11-26 | MyBatis-Plus 分页/防全表攻击拦截器依赖 **`mybatis-plus-jsqlparser` 3.5.18**（显式引入） | **依赖事实**：MyBatis-Plus 3.5.9+ 将 `PaginationInnerInterceptor`/`BlockAttackInnerInterceptor` 从 `mybatis-plus-extension` 拆分至 `mybatis-plus-jsqlparser` 独立模块，缺失时编译报"找不到符号" | `backend/pom.xml` 增加该构件（版本与 MyBatis-Plus 主版本一致 3.5.18）；`MybatisPlusConfig` 不变 | 已确认（依赖事实） |
| 2026-11-26 | Testcontainers 集成测试采用 **`@ServiceConnection` + `@Bean` 容器单例**（`AbstractIntegrationTest.TestcontainersConfiguration`） | 朴素的"基类 `@Container` 静态容器"在多测试类共享 Spring 缓存上下文时，会因每个测试类重建容器、旧连接池指向已停止容器而失败（连接被拒） | MySQL 容器随应用上下文生命周期启动/停止，跨测试类共享；`mvn verify` 稳定通过 | 已确认 |

## 记录规则

1. 新决策追加到表格末尾，日期使用 `YYYY-MM-DD`。
2. 决策涉及依赖变更时必须记录具体版本号与冲突事实。
3. 状态取值：`已确认` / `待架构师确认` / `已废弃（注明替代决策）`。
4. 核心架构、技术栈、财务规则、UI 设计语言的任何变更先记录于此并经架构师批准后方可实施。
