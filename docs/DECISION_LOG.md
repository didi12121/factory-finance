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
| 2026-11-27 | **语义 foreground Token**（`--color-brand/success/warning/danger-foreground`）用于状态与品牌文字 | 实测对比度：状态色文字在 subtle 背景上 3.65–4.29:1，低于 WCAG AA 4.5:1；新增加深前景色（5.38–6.29:1）达标 | 品牌主色 `--color-brand` #635bff 保留（按钮/图形）；状态文字改用 foreground Token；对比度表更新于 `DESIGN_SYSTEM.md` 第 5 节 | 已确认 |
| 2026-11-27 | `cn()` 使用 **extendTailwindMerge** 注册自定义字号/颜色 Token 类组 | tailwind-merge 默认无法区分自定义 `text-metric`（字号）与 `text-text-primary`（颜色），会错误互删导致 FinancialMetric 字号失效 | `utils/cn.ts` 显式声明类组并以单测固定合并行为 | 已确认 |
| 2026-11-27 | 金额层职责分离：`decimal.ts` 中间精确运算（含 **compareAmounts** BigInt 精确比较）/ `money.ts` 业务金额校验（DECIMAL(18,2)、严格千分位） | 整改要求：严格千分位校验（禁止删逗号接受非法输入）、运算与业务校验分离、非法输入不得提交旧金额 | `AmountInput` 契约：空值/必填/负数/输入中间态/失焦/提交校验（组件头注释）；测试覆盖边界与提交场景 | 已确认 |
| 2026-11-27 | DataTable 金额列排序使用 **`amountSortingFn`（compareAmounts）**；表头输出 `aria-sort`、支持键盘排序 | 整改要求：金额排序禁用 Number 排序误差；可访问性要求键盘可触发排序 | `components/shared/tableSorting.ts`；数据刷新越界页码自动钳制 | 已确认 |
| 2026-11-27 | **Maven Wrapper 3.9.11**（`backend/mvnw(.cmd)`）+ 脚本去绝对路径（JAVA_HOME/PATH 探测） | 工程可移植性：禁止通用脚本硬编码开发机路径；Linux/macOS 提供 `.sh` 脚本 | `scripts/dev-backend.*`、`scripts/run-tests.*` 跨平台可用 | 已确认 |
| 2026-11-27 | Compose 端口策略：**容器内部固定 8080**，宿主机映射用 `BACKEND_PORT` | 整改要求：Nginx、健康检查与 Compose 网络内部端口一致 | `docker-compose.yml` / `.env.example` | 已确认 |
| 2026-11-27 | Node 版本要求统一为 **`^22.22.2 \|\| >=24.15.0`**（`engines` + `.nvmrc` 24.15.0），jsdom 固定 30.1.3 | jsdom 系（30/31 同）声明 engine ≥24.15，本机 24.14 产生 EBADENGINE 警告；声明 engines + CI 使用 Node 24 使版本要求统一 | 测试在本机 24.14（警告但全绿）与捆绑 Node 24.21 下验证 | 已确认（已知警告） |
| 2026-11-27 | **Flyway `baseline-on-migrate` 默认关闭** | 整改要求：禁止隐式基线与破坏性初始化；已有非空 schema 须人工审核迁移历史 | `application.yml`；V1 迁移保持注释-only 基线 | 已确认 |
| 2026-11-27 | JWT 安全基线：**固定 HS256**、密钥 **≥32 字节**、**保留声明不可被附加 claims 覆盖**；非 dev/test 环境禁止占位 Secret（启动即失败） | 整改要求：明确算法与密钥策略、保留声明保护、占位 Secret 治理 | `JwtService`（保留声明过滤 + 显式 `Jwts.SIG.HS256`）、`SecurityStartupValidator`；Trace ID 外部输入限 `^[A-Za-z0-9_-]{8,64}$` | 已确认 |
| 2026-11-27 | SecurityConfig **CorsConfigurationSource 以独立 Bean 注入** | 整改要求：禁止调用时传入 null 占位参数 | `SecurityConfig` 构造注入，Bean 方法由 `@Value` 提供允许来源 | 已确认 |
| 2026-11-27 | 金额千分位正则修复：`GROUPED_INT = '[1-9]\\d{0,2}(,\\d{3})+'` | 旧正则首组 `[1-9]{1,3}` 禁止含 0，导致 `10,000.00`/`100,000.00` 等合法金额被拒 | `money.test.ts` 补充合法分组用例；DECIMAL(18,2) 范围校验保留 | 已确认 |
| 2026-11-27 | AmountInput 契约明确：`valid`/`touched`/`showError` 独立语义；必填空值 `valid` 恒 false；中间态不判合法；`externalError` 阻断 `validate()`；错误 DOM ID 唯一（`useId`）；外部重置语义（新值同步 + `reset()` 清草稿） | Hotfix 评审整改要求（防止提交绕过外部校验、多实例 ID 冲突、重置残留草稿） | 24 个单元测试覆盖全部契约（含真实父组件 v-model 场景） | 已确认 |
| 2026-11-27 | JWT 解析端使用 JJWT 官方算法白名单 **`sig().add(Jwts.SIG.HS256)`**，必要声明 sub/iss/iat/exp 存在性强校验 | Hotfix 要求：签发与解析均仅允许 HS256、使用正式白名单机制、不依赖未验证 Header | 非 HS256（HS512）、缺声明、错误 issuer、过期、篡改均有拒绝测试 | 已确认 |
| 2026-11-27 | CORS 抽离独立配置类 **`infrastructure.web.CorsConfig`** | 消除安全配置类对自身 Bean 的构造注入风险 | `CorsPolicyIT` 真实上下文验证允许/拒绝来源（拒绝来源 403 且无 CORS 头；允许来源回显具体 Origin，非通配符） | 已确认 |

## 记录规则

1. 新决策追加到表格末尾，日期使用 `YYYY-MM-DD`。
2. 决策涉及依赖变更时必须记录具体版本号与冲突事实。
3. 状态取值：`已确认` / `待架构师确认` / `已废弃（注明替代决策）`。
4. 核心架构、技术栈、财务规则、UI 设计语言的任何变更先记录于此并经架构师批准后方可实施。
