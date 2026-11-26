# Factory Finance — 开发路线图

> 阶段顺序与命名固定保留（任务文档第 16 节），不得擅自增删、合并或调序。
> **未经明确批准，不得进入下一阶段。** 阶段状态：Phase 0.1 → `READY_FOR_REVIEW` 后停止开发，等待架构师与产品负责人审核。

## 总览

```text
Phase 0.1 — Foundation & Design System
Phase 0.2 — Core UI Prototypes
Phase 0.3 — UI Review & Visual Baseline
Phase 1   — Treasury & Basic Operations
Phase 2   — Receivable & Payable
Phase 3   — Accounting Engine
Phase 4   — Assets & Financial Reporting
Phase 5   — Factory Business Analytics
Phase 6   — AI Finance Assistant
```

> **跨阶段红线**：Phase 1 和 Phase 2 实现的真实财务业务必须遵循已经确认的会计架构（`ACCOUNTING_RULES.md`），
> 避免产生无法在 Phase 3 完整核算的历史数据。任何"先记账后补规则"的做法都不允许。

---

## Phase 0.1 — Foundation & Design System（当前阶段）

**目标**：工程骨架、模块化单体基础架构、前端工程初始化、Docker Compose 本地开发环境、架构与约束文档、Design System V1.0、公共 UI 组件基础设施、基础页面布局、自动化测试与截图测试基础设施。

**验收要点**（任务文档第 18 节）：

- 前端可正常构建及启动；后端可正常构建及启动；MySQL + Flyway 正常工作；Docker Compose 开发环境可运行。
- 架构文档齐全（`docs/` 全套）；Design Tokens 已实际使用；Application Shell 可正常交互；公共组件具备可验证行为；`/dev/design-system` 可访问。
- 自动化测试完成（后端 JUnit 5 + Testcontainers、前端 Vitest、Playwright 真实浏览器验证）；`artifacts/screenshots/phase-0.1/` 实际截图已生成。
- 没有真实财务业务越界实现；没有硬编码 Secret；没有未经批准的架构和技术栈变更。
- 测试环境不具备某项能力时记录 `BLOCKED`，不得伪造通过结果。

## Phase 0.2 — Core UI Prototypes（计划）

**目标**：核心业务页面的 UI 原型（经营概览、资金、应收应付等关键页面的静态/交互原型），用于产品与视觉评审。

**验收要点**：原型页面覆盖核心工作流；遵守 UI 禁止事项；使用虚构测试数据；不接入真实业务逻辑。（具体范围待架构师与产品负责人确认。）

## Phase 0.3 — UI Review & Visual Baseline（计划）

**目标**：UI 评审与视觉基线固化——原型经人工审核、修改后确定视觉回归基线。

**验收要点**：视觉回归基线在**人工审核通过后**固化；评审结论与修改项记录归档（`docs/reviews/`）。

## Phase 1 — Treasury & Basic Operations（计划）

**目标**：资金账户、资金流水、账户间转账；客户/供应商基础资料；采购、工资、水电费等基本费用登记；正式登录与用户/角色/权限、JWT 生命周期。

**验收要点**：

- 资金余额可通过有效流水 + 期初余额重算（`ACCOUNTING_RULES.md` 第 4 节）。
- 账户间转账不产生收支；每笔实际收付款只记一次资金流入/流出。
- 金额全程 `BigDecimal` / `DECIMAL(18,2)` / 十进制字符串传输。
- 业务数据带齐多时间维度（业务日期/收付款日期/创建时间/操作人）与唯一单据编号。
- **业务单据的数据形态必须满足 Phase 3 凭证生成的追溯要求**（单据 ↔ 资金流水 ↔（后续）凭证链路完整）。

**模块归属与导航标记**（与侧边栏阶段标记一致）：

| 模块 | 导航 | 阶段标记 |
| --- | --- | --- |
| `treasury` | 资金账户、资金流水 | Phase 1 |
| `masterdata` | 客户管理、供应商管理 | Phase 1 |
| `identity` | 系统设置（用户/角色/权限、JWT 生命周期） | Phase 1 |
| `expense` | 费用管理、工资管理 | Phase 1（基础费用登记） |

## Phase 2 — Receivable & Payable（计划）

**目标**：加工费对账、应收账款与回款核销、应付账款与付款核销、股东往来。

**验收要点**：

- 三表模型 `receivable / receipt / receipt_allocation`（应付对称）落地；多对多核销正确。
- **一笔实际收款只记一次资金流入**，禁止核销多单导致重复计入资金余额。
- 预收款、未分配收款、退款、坏账、折扣、冲销均有明确独立规则（规则需经架构师确认后实现）。
- 未核销余额可重算对账。
- **产生的数据必须可被 Phase 3 会计引擎完整核算**，不允许旁路记录。

**模块归属与导航标记**（与侧边栏阶段标记一致）：

| 模块 | 导航 | 阶段标记 |
| --- | --- | --- |
| `receivable` | 应收账款、加工费回款 | Phase 2 |
| `payable` | 应付账款 | Phase 2 |
| `shareholder` | 股东往来 | Phase 2 |

## Phase 3 — Accounting Engine（计划）

**目标**：自动复式记账引擎——由业务单据自动生成凭证与分录、过账、冲销更正。

**验收要点**：

- `借方合计 = 贷方合计` 强校验；每笔已过账业务可追溯原始单据。
- 已过账凭证不可修改/物理删除，更正走冲销/更正凭证。
- 记账操作事务一致且幂等。
- **回溯校验**：Phase 1/2 积累的业务数据能完整生成凭证；无法核算的数据必须保留原始业务事实，生成差异报告，经人工确认后通过可追溯的数据更正或迁移修复处理。禁止通过删除、清零、覆盖历史财务数据的方式消除核算差异。未完成核算校验的数据不得正式过账。

## Phase 4 — Assets & Financial Reporting（计划）

**目标**：固定资产与折旧；资产负债表、利润表、现金流量表。

**验收要点**：折旧规则经架构师确认后实现；三大报表由已过账分录汇总生成，禁止绕过凭证直接改报表；报表勾稽关系校验通过。

## Phase 5 — Factory Business Analytics（计划）

**目标**：工厂经营分析——加工费、成本、利润、现金流等经营维度分析。

**验收要点**：分析口径与财务口径一致、可解释；图表服务于业务决策，遵守 UI 禁止事项（无意义图表禁止）。

## Phase 6 — AI Finance Assistant（计划）

**目标**：AI 财务助手（辅助录入、查询、分析解读）。

**验收要点**：待架构师与产品负责人确认；AI 输出不得违反会计规则与"用户录入事实、系统执行规则"的产品原则。

---

## 阶段门禁

1. 每阶段完成后输出结构化交付报告（Phase 0.1 模板见任务文档第 19 节），状态 `READY_FOR_REVIEW` / `BLOCKED`。
2. `PHASE_0_1 = READY_FOR_REVIEW` 后停止开发；`PHASE_0_2_STARTED = NO` 直至批准。
3. 依赖版本冲突时记录具体问题（`DECISION_LOG.md`），不得擅自替换核心技术栈。
