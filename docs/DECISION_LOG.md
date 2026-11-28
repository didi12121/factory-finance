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
| 2026-11-27 | Design System 展示页**构建期隔离**（`devOnlyView()` 与 prototypeView 同机制，QA F-001 P1 整改） | QA 产物扫描发现 DesignSystemView chunk（含虚构测试数据）进入生产 dist | 生产构建下该 chunk 被 Rollup 消除，dist 演示特征字符串 0 命中 | 已确认 |
| 2026-11-27 | **Prototype Contract V1.1**：契约目录新增 `labels.ts`（业务类型标准标签 + 图表短标签显式别名），dashboard/treasury 双份标签映射收敛为单一来源（QA F-002 整改） | 展示元数据双份维护且文案不一致；契约变更经主 Agent（裁决人）批准并回写两消费方 | 版本 V1 → V1.1（仅新增展示元数据，类型/接口/导航契约不变） | 已确认 |
| 2026-11-27 | FinancialMetric 指标区**左对齐基线**（MoneyText `align="left"`），表格金额保持右对齐（QA F-003 整改：文档同步） | Phase 0.2 评审要求标签/金额统一左基线（Stripe 指标区层级）；DESIGN_SYSTEM.md §4 原「指标卡右对齐」表述已同步更新 | MoneyText 新增 align 属性（默认 right 不变） | 已确认 |
| 2026-11-27 | **PROTOTYPE_CONTRACT V1.2**：ReceivableSummary 新增 `integrity` 诊断字段（超额核销显式暴露，禁止静默钳制） | Phase 0.3 派生数据完整性整改；预授权契约变更，唯一实现人 Agent A | 派生层保留原始应收/真实核销合计 + 异常标记；写时校验仍为第一道防线 | 已确认 |
| 2026-11-27 | 环境隔离开关切换为**显式允许清单**（`app/envAllowlist.ts`，仅 development/test 启用演示；production/staging/uat/自定义 mode 默认禁用） | 旧 `MODE !== 'production'` 会误放行 staging/uat；default-deny + 双形态单一来源（运行期纯函数 + 构建期可折叠常量） | 四 mode 产物扫描 0 命中 + 浏览器路由验证 + test 模式反向对照；CI 隔离矩阵 Job 建立 | 已确认 |
| 2026-11-27 | **A3 创建期语义裁决**：应收单允许创建未来月/未来日期（真实公历校验保留），但不计入截至 DEMO_TODAY 的已确认收入；实际收款日期 ≤ DEMO_TODAY 强制拒绝 | 阶段规范原文约束的是收入确认而非创建；主 Agent 简报过严与只读基线测试冲突，按规范校准 | 收入过滤实证（创建 2026-12 单据后本期收入不变）；Mandatory Regression 4 口径不变 | 已确认 |
| 2026-11-27 | app-shell.test.ts 纯新增断言（父级高亮/降噪）超出 Agent C 严格清单，集成层**裁定接受** | 测试断言与 C3 交付行为对应，零删弱 | 记录为所有权例外 | 已确认 |
| 2026-11-27 | **截图证据策略**：历史阶段截图（phase-0.1.1/0.2）冻结保护，交付截图输出切至 `phase-0.3/`；Playwright 统一 locale=zh-CN / timezone=Asia/Shanghai | 已审核证据不被集成运行覆盖；视觉基线确定性 | 截图经统一 `scrollTop=0` 采集（sticky+fullPage 伪影修复，QA 三证复核成立） | 已确认 |

| 2026-11-28 | **请求幂等独立于业务单据编号**：新增 `sys_request_idempotency(operation, idem_key)` 唯一表 + `IdempotencyGuard`（占位 → 业务写入 → 回填单据） | Phase 1 幂等依赖「单据编号冲突 / 业务内容相同」，不满足 Phase 2 §2.A（前端每次独立操作生成稳定键、重试复用、数据库唯一约束、同键异参拒绝、不同键相同内容允许） | 出资/支出/转账/应收/收款/应付/付款全部接入；`idempotencyKey` 成为创建接口必填字段（缺失 400）；单据编号唯一键仅作编号冲突最终防线 | 已确认 |
| 2026-11-28 | 业务写事务使用 **`Isolation.READ_COMMITTED`**（create 方法级） | 幂等键冲突后的「读取已提交结果」在 REPEATABLE READ 快照下可能读不到并发事务刚提交的单据（表现为假 409/404）；唯一键冲突后改用当前读（FOR UPDATE）+ READ_COMMITTED 快照，语义与幂等契约一致 | 仅影响 7 个业务 create 方法的事务隔离级别；行锁仍显式（账户/应收/应付 FOR UPDATE），不引入丢失更新风险 | 已确认 |
| 2026-11-28 | 撤销记录 `tst_void_record.reverse_transaction_id` 允许 NULL | 应收/应付撤销本身不产生资金流水（确认应收/应付不涉及资金），原结构 NOT NULL 只能覆盖资金类单据 | 应收/应付撤销复用同一撤销单序列（VN-YYYYMM-0001）与唯一目标约束；资金类撤销仍强制反向流水 | 已确认 |
| 2026-11-28 | 资金账户写流水与期初修改**互斥**：写流水前 `SELECT ... FOR UPDATE` 账户行；业务日期不得早于账户期初日期（转账同时校验两个账户） | Phase 2 §2.D：禁止资金流水早于期初日期，并要求期初修改与流水写入并发一致 | `AccountLookup.requireForFlow` 统一入口；`AccountService.update` 锁定账户行后判断已有流水 | 已确认 |
| 2026-11-28 | 回款/付款**本阶段强制全额核销**（Σ核销 = 实收/实付），未分配收款与预收款不实现 | 任务明确要求（Phase 2 §4/§5），避免超额回款计入收入或产生未分配资金 | 后端 `evaluateAllocations` 强制校验（400 明确提示）；前端展示未分配金额并禁用确认 | 已确认 |
| 2026-11-28 | 应收/应付模块通过 **`treasury.api.FundFlowPort`** 写入资金流水与撤销冲销，通过 `masterdata.api.{Customer,Supplier}DirectoryApi` 解析主数据 | 架构红线：业务模块只依赖 `common`/`infrastructure`，模块间仅经 api 包协作，禁止跨模块直查表 | 新增 api 端口 + treasury 实现类；`VoidService` 增加外部单据撤销入口（`voidExternalFundDocument` / `registerVoidOnly`） | 已确认 |
| 2026-11-28 | **避免重复扣减采购付款**：应付单可关联 Phase 1 采购支出单（`funded_expense_id`），关联后视为已付（SETTLED）并禁止再次付款 | Phase 2 §5 明确禁止同一笔采购付款重复扣减资金；业务内容相同不能作为幂等判据 | 付款核销校验返回 409（状态冲突），资金余额不变；应付视图已付金额含支出单金额 | 已确认 |
| 2026-11-28 | 前端应收/回款页面**接入真实 API**（`useBusinessStore` 替换原型内存 Store），并新增应付/付款/供应商真实页面；应收/应付路由不再做 prototype 构建期隔离 | Phase 2 §3/§4/§5 要求复用现有原型页面并接入正式后端与 MySQL；原型仅保留为历史演示模块 | 路由放开 `/business/receivables`、`/business/processing-fee`、`/business/payables`、`/masterdata/suppliers`；`PROTOTYPE_BUILD` 门控移除 | 已确认 |
| 2026-11-28 | **隔离扫描口径调整**：`verify-isolation.mjs` 演示特征收敛为原型引擎专有实现（`MemoryPrototypeRepository`/`usePrototypeStore` 等）与虚构 fixture；应收/回款/应付业务词汇（收款单、登记回款、createReceivable 等）与 `receivable/receipt` chunk 名不再视为演示特征 | 这些页面已成为生产业务页面，旧口径会把真实业务误判为演示泄漏（生产构建必然 FAIL） | 生产构建 `forbidden_total_hits=0`、chunk 名 0 命中、骨架对照 PASS；demo 特征（DEMO_TODAY、示例客户、虚构等）仍强制 0 命中 | 已确认 |
| 2026-11-28 | 集成测试支持**外部 MySQL 替代 Testcontainers**：`-Dff.testcontainers=false` + `spring.datasource.*` | 受限开发机无 Docker 守护进程，需在同一套真实 MySQL 8 语义下验证（禁止 H2 替身） | `AbstractIntegrationTest` 容器 Bean 增加 `@ConditionalOnProperty`；CI 默认仍走 Testcontainers | 已确认 |
| 2026-11-28 | 经营概览指标区改为**响应式网格**（`grid` + 断点列数），并新增「当前应收余额」「当前应付余额」真实指标 | 指标由 5 项增至 6 项后 1280/1440 视口出现页面级横向溢出（layout-audit 实测 266px/106px）；应收应付余额需读取真实数据库 | `buildWorkbenchMetrics(summary, balances)`；`/receivable/summary` + `/payable/summary` 提供真实派生值；两处余额取不到时标注「数据不可用」而非假数字 | 已确认 |
| 2026-11-28 | CI E2E 显式注入 `APP_CORS_ALLOWED_ORIGINS`（127.0.0.1/localhost 的 4173 与 4175）与 `VITE_API_PROXY_TARGET=http://127.0.0.1:8080` | CI 以 `docker` profile 启动后端，CORS 白名单仅默认 `localhost:5173`；浏览器同源 GET 不带 `Origin` 可访问，而登录/建单/收款/付款等 POST 带 `Origin` 被拒（403 Invalid CORS request），表象为「网络请求失败」与对话框不关闭；生产不放宽回环，仅 CI 测试端口 | CI E2E Job 转绿（run 46109713 前身）；本地等价验证同端口可复现 | 已确认 |
| 2026-11-28 | `prod-guard.spec.ts` 改为**真实登录后**校验 `/dev/design-system` 生产重定向 | 该用例假设 `/workbench` 无需登录，Phase 1 起已受登录守卫保护（未登录会被重定向到 /login），断言过期 | 生产构建防护在 CI 中通过；同时保留「Color Tokens 0 命中」隔离断言 | 已确认 |
| 2026-11-28 | 主数据业务编号序列 `selectMaxSequence` 返回类型 **Integer → Long**（客户/股东/供应商） | `MAX(CAST(SUBSTRING(no, n) AS UNSIGNED))` 在存在较长数字编号时超出 Integer 范围 → `DataIntegrityViolationException`（500）；CI 全量测试因编号累积暴露该潜在缺陷 | 三个 Mapper/Service 改为 long 计算，编号格式不变（前缀 + 4 位起序号）；`ShareholderIT`/`CustomerIT` 不再受数据累积影响 | 已确认 |
| 2026-11-28 | 采购支出 ↔ 应付单关联完整性：`pay_payable` 新增 STORED 生成列 `funded_expense_key`（仅 status='CONFIRMED' 时有值）+ 唯一索引 | MySQL 无部分索引；「同一笔采购支出最多关联一张**有效**应付单」需要「撤销后自动解除」的语义，生成列 + 唯一键可同时满足数据库级约束与业务语义 | 并发重复关联只有一笔成功；撤销应付单自动解除关联（可重新关联）；历史行保留 `funded_expense_id` 可追溯 | 已确认 |
| 2026-11-28 | 资金单据撤销前置校验采用 **SPI 反向依赖**（`treasury.api.FundDocumentVoidGuard`，应付模块注册实现） | 需表达「采购支出已被有效应付单引用则禁止撤销」的跨模块约束，同时避免 treasury 反向依赖 payable 模块 | `VoidService` 收集全部 guard Bean 并在撤销出资/支出/转账前校验；返回 409 且提示需先撤销对应应付单 | 已确认 |
| 2026-11-28 | 新增 **`importer` 模块**（导入批次 + 行明细 + 模板/预览/导入接口），并引入 **Apache POI 5.2.3**（`poi-ooxml`） | Excel 解析/生成需 OOXML 库；导入属于独立能力域，与 12 个业务模块解耦；POI 5.x 为 jakarta 兼容线且本地/CI 均可解析 | 新依赖记录于此；模块仅依赖各业务模块 `api` 端口，不直写业务表 | 已确认 |
| 2026-11-28 | 数据导入全部经既有业务 Service（新增 `MasterdataWriteApi` / `TreasuryWriteApi` / `ReceivableWriteApi` 端口），**逐行独立事务** | MVP §3 明确禁止绕过财务校验、事务、幂等与资金流水规则；逐行事务保证失败行零残留，成功行记录业务单据主键可追溯 | 单行失败不影响其它行；导入批次与行明细落库；不引入批量事务导致的整体回滚风险 | 已确认 |
| 2026-11-28 | 导入去重双保险：**文件级**（模板 + 文件 SHA-256 唯一，重复确认返回既有批次）与**行级**（幂等键 = `imp` + SHA-256(模板+规范化行内容) 前 40 位） | 「重复导入防护」需同时覆盖「同一文件重复提交」与「修订后文件中的相同内容行」；业务内容规范化（金额两位小数）避免格式差异导致漏判 | 同键同参由业务服务幂等返回原单据；文件内完全相同的行标记 DUPLICATE 跳过 | 已确认 |
| 2026-11-28 | 生产部署补充：Nginx `client_max_body_size 12m`；`.env` 增加 `ADMIN_INITIAL_PASSWORD`；`application.yml` multipart 10MB/12MB | Excel 导入经 Nginx 反向代理，默认 1MB 会 413；Compose 后端环境变量此前缺少管理员初始密码 | 生产上传与容器初始化均可正常工作；已用真实 Compose 部署实测 | 已确认 |
| 2026-11-28 | Nginx 反向代理改为透传 **`Host $http_host` + `X-Forwarded-Host`**，Compose 注入 `APP_CORS_ALLOWED_ORIGINS` | 原配置 `Host $host` 丢失端口，后端重建请求 URL 与浏览器 `Origin` 不一致，同源 POST 被判为跨域 → 403 空响应体（前端表现为「网络请求失败」）；浏览器登录/保存全部失败 | 同源经代理访问不再触发 CORS 判定；局域网 IP/域名访问可通过 `APP_CORS_ALLOWED_ORIGINS` 显式放行；部署验证新增「带 Origin 请求」验收项 | 已确认 |
## 记录规则

1. 新决策追加到表格末尾，日期使用 `YYYY-MM-DD`。
2. 决策涉及依赖变更时必须记录具体版本号与冲突事实。
3. 状态取值：`已确认` / `待架构师确认` / `已废弃（注明替代决策）`。
4. 核心架构、技术栈、财务规则、UI 设计语言的任何变更先记录于此并经架构师批准后方可实施。
