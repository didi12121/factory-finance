# Factory Finance — 架构说明

> 状态：Phase 0.1 基础架构文档。模块内部业务实现处于规划阶段（计划于 Phase 1+ 逐步落地），
> 涉及未实现内容均以「计划于 Phase N」或「待架构师确认」标注。

## 1. 架构风格：模块化单体（Modular Monolith）

Factory Finance 后端采用**模块化单体**架构：单一 Spring Boot 应用（`com.factoryfinance`）、单一 MySQL 数据库，
按业务领域划分模块，模块之间通过明确的接口契约协作，不采用微服务、不引入 RPC 与消息中间件（任务文档第 3 节明确禁止）。

选择理由：

- 小型工厂财务场景的事务一致性要求高（业务单据、资金变动、核销、凭证必须同事务提交），单库单体最简单可靠。
- 团队规模与运维能力有限，避免微服务带来的分布式事务、服务治理成本。
- 模块边界为后续可能的拆分保留清晰的接口面，但不预先支付分布式成本。

## 2. 顶层包结构

```text
com.factoryfinance
├── bootstrap          # 应用启动（FactoryFinanceApplication）
├── common             # 跨模块公用：ApiResponse/ErrorCode/PageQuery/PageResult/
│                      #   BusinessException/GlobalExceptionHandler/TraceIdFilter
├── infrastructure     # 技术基础设施：安全（SecurityConfig/JwtService/JwtProperties）、
│                      #   持久化（MybatisPlusConfig）、OpenAPI（OpenApiConfig）
└── modules            # 12 个业务模块（见下）
```

## 3. 模块边界（12 业务模块）

| 模块 | 职责 |
| --- | --- |
| `identity` | 用户、角色、权限、登录与 JWT 生命周期（**计划于 Phase 1**；本阶段仅有 `AuthApi` 接口设计与 DTO） |
| `masterdata` | 客户、供应商等基础资料（计划于 Phase 1/2） |
| `treasury` | 资金账户、资金流水、账户间转账（计划于 Phase 1） |
| `receivable` | 应收单、收款单、核销明细、预收与坏账（计划于 Phase 2） |
| `payable` | 应付单、付款单、付款核销（计划于 Phase 2） |
| `expense` | 采购、工资、水电费等经营费用（计划于 Phase 1/2） |
| `shareholder` | 股东出资、借款、垫资、分红往来（计划于 Phase 2） |
| `fixedasset` | 固定资产卡片与折旧（计划于 Phase 4） |
| `accounting` | 会计凭证、分录、过账与冲销（会计引擎计划于 Phase 3） |
| `reporting` | 资产负债表、利润表、现金流量表（计划于 Phase 4） |
| `attachment` | 业务单据附件（本地文件存储接口抽象） |
| `audit` | 操作审计日志 |

每个模块按需划分为四层（不为形式主义制造空接口空实现）：

```text
module/
├── api            # 对外契约：接口、DTO；其他模块只允许依赖这一层
├── application    # 用例编排、事务边界
├── domain         # 领域模型与业务规则
└── infrastructure # 本模块的持久化与外部实现
```

## 4. 模块依赖规则（强制）

1. **业务模块只允许依赖 `common` 与 `infrastructure`**，禁止依赖其他业务模块的 `application`/`domain`/`infrastructure` 包。
2. **模块间协作只通过 `api` 包中的接口与 DTO**（例如 `receivable` 需要记账时调用 `accounting.api` 的记账接口，由 `accounting` 模块内部生成凭证）。
3. **禁止跨模块直查对方表**：任何模块不得在自己的 Mapper/SQL 中 join 或读写其他模块拥有的表；跨模块数据需求通过 api 接口获取或通过只读投影（待架构师确认）解决。
4. 每个模块**拥有自己的表**，表前缀按模块划分（草案见 `DATABASE_DESIGN.md`）。
5. 依赖方向示意（单向、无环）：

```text
modules/*（业务模块） ──依赖──▶ common / infrastructure
modules/A ──仅通过──▶ modules/B.api ──▶ modules/B 内部实现
```

## 5. 事务边界

- 事务边界位于**模块 `application` 层**的用例方法上（Spring `@Transactional`），`domain` 层不感知事务 API。
- 一个业务操作（如"登记收款单 + 生成资金流水 + 生成核销 + 触发记账"）必须在**同一数据库事务**内完成，失败整体回滚（任务文档 6.3：事务一致性与幂等性）。
- 跨模块调用在同一个本地事务内执行（单库单体的优势）；模块接口不得自行开启脱离调用方的新事务，除非明确标注 `REQUIRES_NEW` 并记录理由（待架构师确认）。
- **幂等性**：涉及资金与凭证的写操作必须具备幂等保障（业务单据编号唯一约束 + 去重键），重复请求不得重复记账。
- 只读查询不开启写事务；报表类查询（`reporting`）不参与业务写事务。

## 6. 数据流

典型业务数据流（以回款为例，**计划于 Phase 2/3 实现**）：

```text
用户录入（前端）
  → REST /api/v1/...（统一 ApiResponse + Trace ID）
  → receivable.application（用例编排，事务开始）
      → receivable.domain（应收/收款/核销规则校验）
      → treasury.api（登记资金流水，仅记一次资金流入）
      → accounting.api（生成记账请求，凭证在 Phase 3 生成）
  → MySQL（业务表 + 流水表 + 核销表 同事务提交）
  → 审计日志（audit 模块）
```

技术数据流（Phase 0.1 已实现）：

```text
前端(Vite dev :5173，代理 /api → :8080) 或 Nginx(:8088 → backend:8080)
  → TraceIdFilter（生成/透传 X-Trace-Id，写入 MDC）
  → Spring Security（无状态；除 health 与文档端点外全部要求认证，未认证返回 401）
  → Controller → 统一 ApiResponse 包装 → GlobalExceptionHandler 兜底
```

## 7. 业务单据与财务总账的关系

- **业务单据是事实来源**：应收单、收款单、应付单、付款单、费用单、固定资产卡片等记录业务事实。
- **资金流水记录资金事实**：每一笔实际收付款在 `treasury` 产生且仅产生一条资金流水；账户间转账只产生资金内部划转，不产生收支（任务文档 6.1）。
- **核销记录业务匹配关系**：收款单与应收单通过核销明细多对多关联，核销不重复产生资金流入（6.5）。
- **会计凭证是财务口径的映射**：`accounting` 模块依据业务单据与既定规则生成凭证与分录（复式记账，借贷平衡）；**已过账凭证不可修改或物理删除**，更正走冲销/更正凭证（6.3）。
- **总账与报表是派生数据**：报表由已过账分录汇总而来，不允许绕过凭证直接改报表。
- 每一笔已过账业务可**反向追溯**到原始业务单据（凭证与单据双向关联字段，草案见 `DATABASE_DESIGN.md`）。
- 业务与财务口径分离的完整规则见 `ACCOUNTING_RULES.md`。

## 8. 基础设施清单（Phase 0.1 已实现）

| 能力 | 实现 |
| --- | --- |
| 统一响应模型 | `common.api.ApiResponse`（code/message/data/traceId） |
| 统一错误码 | `common.api.ErrorCode`（与 HTTP 状态语义一致） |
| 全局异常处理 | `common.web.GlobalExceptionHandler`（`BusinessException` + 参数校验 + 安全异常 + 兜底） |
| 分页模型 | `common.api.PageQuery`（page≥1，size 1–500）/ `PageResult`（items/total/page/size） |
| Request/Trace ID | `common.web.TraceIdFilter`（`X-Trace-Id` 透传/生成，MDC 记录，响应头回写） |
| 安全基础 | `infrastructure.security.SecurityConfig`（无状态、JWT 基础设施 `JwtService`，业务接口默认 401） |
| OpenAPI | `infrastructure.web.OpenApiConfig`（仅非 docker 环境启用文档） |
| 健康检查 | `GET /api/v1/health` + Actuator `/actuator/health` |
| 持久化 | MyBatis-Plus 3.5.18 + Flyway 迁移机制（V1 仅基线，无业务表） |
| 环境隔离 | `application.yml` / `application-dev.yml`（本地占位凭证）/ `application-docker.yml`（环境变量注入） |

## 9. 架构红线（违反即返工）

1. 不得引入微服务、Nacos、Dubbo、Redis、Kafka、RabbitMQ、Elasticsearch、Kubernetes（任务文档第 3 节）。
2. 不得跨模块直查/直写对方表；不得绕过 `api` 包协作。
3. 不得在业务模块内重复实现 `common` 已有的统一响应、分页、异常、Trace ID 逻辑。
4. 不得在未确认会计规则的情况下实现正式财务业务（见 `ACCOUNTING_RULES.md` 未确定事项清单）。
5. 核心架构、技术栈、财务规则、UI 设计语言的任何变更必须先进入 `DECISION_LOG.md` 并经架构师批准。
