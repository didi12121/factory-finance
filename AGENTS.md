# AGENTS.md — Factory Finance 开发约束（对所有开发 Agent 生效）

> 本文件是项目级强制约束。任何 Agent 开工前必须阅读本文件及 `docs/` 对应文档。
> 核心架构、技术栈、财务规则及 UI 设计语言**不得未经批准修改**；重要决策记录于 `docs/DECISION_LOG.md`。

## 1. 项目目标

Factory Finance 是面向**小型注塑加工工厂**的轻量级财务管理系统，最终替代现有 Excel 账目管理方式。最终支持：资金账户及资金流水、股东出资/借款/垫资/分红、客户与供应商管理、加工费对账、应收账款及回款核销、应付账款及付款核销、采购/工资/水电费/其他费用、固定资产与折旧、自动复式记账、资产负债表/利润表/现金流量表、工厂经营分析、后续 AI 财务助手。

**核心产品原则：用户负责录入真实业务，系统负责执行财务规则、生成凭证、计算余额及统计报表。**

## 2. 强制技术栈（照抄任务文档第 3 节，附实际锁定版本）

### Backend

| 技术 | 实际锁定版本 |
| --- | --- |
| Java | 21 |
| Spring Boot | 3.x（实际 **3.5.16**，`spring-boot-starter-parent`） |
| Maven | 是（`backend/pom.xml`） |
| MyBatis-Plus | **3.5.18**（`mybatis-plus-spring-boot3-starter`） |
| MySQL | 8（Docker 镜像 **mysql:8.4**） |
| Flyway | `flyway-core` + `flyway-mysql`（Boot BOM 管理，**11.7.2**） |
| Spring Security | Boot BOM 管理（`spring-boot-starter-security`） |
| JWT | **jjwt 0.12.7**（api/impl/jackson） |
| Jakarta Validation | `spring-boot-starter-validation` |
| OpenAPI | **springdoc-openapi-starter-webmvc-ui 2.10.1** |
| JUnit 5 | `spring-boot-starter-test` |
| Testcontainers | **1.21.4**（mysql、junit-jupiter） |

### Frontend

| 技术 | 实际锁定版本 |
| --- | --- |
| Vue | **3.5.46** |
| TypeScript（strict） | **5.9.3** |
| Vite | **7.3.8** |
| Vue Router | **4.6.5** |
| Pinia | **3.0.4** |
| shadcn/vue | 规范本地化实现：**reka-ui 2.11.0** + **tailwind-merge 3.7.1** + **class-variance-authority 0.7.1** |
| Tailwind CSS | **4.3.5**（`@tailwindcss/vite` 4.3.5，CSS-first `@theme`） |
| TanStack Table | **8.21.3**（`@tanstack/vue-table`，稳定 v8 线） |
| Lucide Icons | **@lucide/vue 1.81.0**（`lucide-vue-next` 已废弃，禁止使用） |
| ECharts | **6.1.0** |
| Axios | **1.21.1** |
| Vitest | **4.1.12** |
| Playwright | **@playwright/test 1.65.1** |
| 字体 | **@fontsource-variable/inter 5.3.0** + **@fontsource/noto-sans-sc 5.3.1**（本地 npm 字体包分发） |

### Infrastructure

| 技术 | 说明 |
| --- | --- |
| Docker Compose | MySQL 8.4 + 后端 + 前端/Nginx（`docker-compose.yml`） |
| Nginx | `deploy/nginx/default.conf`：代理 `/api`、SPA 路由回退 |
| 本地文件存储接口抽象 | attachment 模块使用（实现随阶段落地） |

**禁止引入**：微服务架构、Nacos、Dubbo、Redis、Kafka、RabbitMQ、Elasticsearch、Kubernetes、现成的 Admin 后台模板、额外的完整 UI 组件库。

依赖冲突时**记录具体问题**（`docs/DECISION_LOG.md`），不得擅自替换核心技术栈。锁定依赖版本并提交 lockfile。

## 3. 架构约束

- **模块化单体（Modular Monolith）**：单一 Spring Boot 应用 + 单一 MySQL，按业务领域划分 12 个模块：`identity / masterdata / treasury / receivable / payable / expense / shareholder / fixedasset / accounting / reporting / attachment / audit`（包根 `com.factoryfinance.modules`）。
- **模块边界规则**（详见 `docs/ARCHITECTURE.md`）：
  1. 业务模块只允许依赖 `common` 与 `infrastructure`；
  2. 模块间协作只通过对方 `api` 包的接口与 DTO；
  3. **禁止跨模块直查/直写对方表**；
  4. 每个模块拥有自己的表；单模块按需分 `api / application / domain / infrastructure` 四层，禁止制造无用途的空接口空实现；
  5. 事务边界在 `application` 层，业务写操作同事务提交且幂等。
- 统一 API 路径 `/api/v1/...`；统一响应模型 `ApiResponse`（code/message/data/traceId）；统一错误码 `ErrorCode`（HTTP 状态语义一致，禁止统一返回 200）；统一分页 `PageQuery`/`PageResult`；统一异常处理 `GlobalExceptionHandler`；Trace ID（`X-Trace-Id`）统一透传。
- 未开发模块用架构文档描述，**不生成虚假业务代码**。

## 4. 财务数据处理约束（红线，详见 `docs/ACCOUNTING_RULES.md`）

**金额规范：**

- 后端金额一律 Java `BigDecimal`；数据库金额字段 `DECIMAL(18,2)`，高精度字段（单价、成本分摊、折旧中间计算）单独定义精度。
- **禁止 `float` / `double` 参与财务金额计算**。
- 前后端金额通过**十进制字符串**传输；**禁止依赖 JavaScript `Number` 进行需要精确结果的财务运算**（前端用 `frontend/src/utils/decimal.ts` 的 BigInt 定点实现）。
- 舍入方式与舍入时点必须在对应业务规则中明确，禁止无依据提前四舍五入。

**复式记账红线（会计引擎计划于 Phase 3）：**

- `借方金额合计 = 贷方金额合计`；每笔已过账业务可追溯原始单据；**已过账凭证不得直接修改或物理删除**，更正必须通过冲销/更正凭证/明确撤销流程。
- 业务单据、资金变动、核销与凭证记账必须**事务一致且幂等**。
- 资金余额必须可由有效流水 + 期初余额重算；余额缓存不得成为无法核对的独立数据源。
- 业务与财务分离：营业收入 ≠ 实际收款；经营费用 ≠ 实际付款；股东出资 ≠ 营业收入；股东借款 ≠ 所有者权益；购固定资产 ≠ 立即费用；账户间转账不产生收支。
- 应收三表模型 `receivable / receipt / receipt_allocation`：一笔实际收款只记一次资金流入，禁止核销多单重复计入资金余额。
- 内部主键与业务单据编号分离；单据编号唯一且不可变；多时间维度（业务日期/实际收付款日期/会计期间/创建时间/操作人）分别记录。
- 未确定的会计事项（税务、制造成本归集、期初迁移、期间结账、舍入规则、科目表等）**未经架构师确认不得实现**。

## 5. UI 设计规范引用

- Design Tokens、金额展示规范、可访问性、组件清单：**`docs/DESIGN_SYSTEM.md`**（与 `frontend/src/styles/tokens.css` 一致）。
- 强制设计风格、UI 禁止事项、交互与响应式规范、验收标准：**`docs/UI_GUIDELINES.md`**。
- 定位：Professional Financial Operations Software，Stripe Dashboard Inspired（不得使用 Stripe Logo 或冒充官方产品）；禁止 AI Generated UI 风格清单见 UI_GUIDELINES 第 2 节；业务页面禁止散落十六进制颜色；未实现功能不得制造可用假象。

## 6. 代码风格

- **Java 21**：record / 现代语法；**不使用 Lombok**（手写访问器，参考 `ApiResponse`/`ErrorCode` 等现有代码）。
- **TypeScript strict**：**禁止使用 `any` 绕过核心类型检查**。
- **统一基础设施**：所有接口使用 `ApiResponse`、`PageQuery`/`PageResult`、`ErrorCode`、`GlobalExceptionHandler`、`TraceIdFilter`；业务模块**禁止重复实现**这些公共逻辑。
- **公共逻辑禁止重复实现**：格式化、请求拦截、金额处理等公共逻辑统一放在 `common`/`utils`，禁止在各页面/各模块复制。
- 前端组件分层：`components/ui`（原子）/ `components/shared`（业务无关）/ `components/finance`（财务通用）/ `components/layout`（布局）；按 feature 组织业务页面；API 请求统一管理（`services/`）。
- 禁止为了封装而过度封装；禁止形式主义 DDD 空接口。
- 依赖版本只允许使用已锁定版本；新增依赖必须记录 `docs/DECISION_LOG.md`。

## 7. 测试要求

- **后端**：JUnit 5 + Spring Boot Test；集成测试用 **Testcontainers 1.21.4 + mysql:8.4**（`mvn verify` 需要 Docker）。至少覆盖：Context 启动、Health Check、参数校验、统一异常响应、基础安全策略、Flyway 迁移及 MySQL 连接。
- **前端**：**Vitest**（`npm test`）。至少覆盖：金额格式化、金额输入精度校验、公共组件基本行为、路由及布局、Design System Showcase 页面。
- **Playwright**（`npm run test:e2e`）：必须**启动实际应用、使用真实浏览器验证**（页面加载、Sidebar 折叠、导航、Dialog/DetailSheet、DataTable 排序分页、金额组件、键盘可访问性、移动端布局、无非预期横向溢出）。
- **截图**：真实浏览器截图输出 `artifacts/screenshots/phase-0.1/`（shell-1920x1080 / shell-1440x900 / shell-1280x800 / shell-mobile-390x844 / design-system / data-table / dialog / detail-sheet）。**禁止生成式图片或效果图冒充**；Agent 无法查看图片时交架构师审核，不得声称已完成视觉检查。
- 测试环境不具备某项能力时记录 **BLOCKED**，**不得伪造通过结果**。

## 8. 阶段停止条件

```text
PHASE_0_1 = READY_FOR_REVIEW   → 立即停止开发
PHASE_0_2_STARTED = NO
```

Phase 0.1 完成后输出结构化交付报告（任务文档第 19 节模板），然后**停止开发，等待架构师与产品负责人审核**。未经明确批准，不得进入下一阶段。

## 9. 禁止跨阶段开发（任务文档第 17 节禁止清单）

本阶段（Phase 0.1）**明确禁止开发**：

- 真实加工费对账业务
- 真实回款及核销业务
- 工资计算
- 费用记账
- 股东出资业务
- 自动会计凭证引擎
- 固定资产折旧
- 财务报表计算
- Excel 历史数据导入
- AI 财务助手
- OCR
- 多租户
- 复杂工作流审批
- 完整生产环境认证体系

补充禁止项：

- **不得因为开发顺利而主动进入 Phase 0.2**。
- 不得使用伪造 JWT 或默认放行全部业务接口的方式模拟正式认证。
- 不得接入用户真实 Excel 数据；展示数据必须是明确标记的虚构测试数据。
- 不得硬编码真实密码/Secret；不得在启动时自动删除数据库或执行破坏性初始化。
