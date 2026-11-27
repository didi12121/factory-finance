# Factory Finance — 数据库设计（核心实体草案）

> # ⚠️ 草案，未经架构师验收，不得视为最终设计
>
> 本文档为 Phase 0.1 的**核心实体草案**，仅用于对齐概念与约束原则。
> 所有表结构、字段、索引、约束均**未经验收**，不得据此直接编写正式迁移脚本；
> 实际建表须经架构师审核后在 Phase 1+ 的 Flyway 迁移脚本中创建（当前 `V1__init.sql` 仅为迁移基线，不含业务表）。
> 任何字段级设计冲突以架构师裁定为准（待架构师确认）。

## 1. 数据库概况

- MySQL 8（本地 Compose 使用 `mysql:8.4`），字符集 `utf8mb4` / `utf8mb4_unicode_ci`。
- Flyway 管理迁移（`classpath:db/migration`，`baseline-on-migrate`、`validate-on-migrate`）。
- 每个业务模块**拥有自己的表**，禁止跨模块直查/直写（见 `ARCHITECTURE.md` 第 4 节）。
- 表名前缀按模块划分（草案）：`tst_` treasury、`mst_` masterdata、`rec_` receivable、`pay_` payable、`exp_` expense、`shr_` shareholder、`fa_` fixedasset、`acc_` accounting、`sys_` identity/audit。

## 2. 通用数据类型与约束原则（强制）

| 原则 | 规定 |
| --- | --- |
| 金额字段 | `DECIMAL(18,2)`（人民币元，两位小数），Java 侧 `BigDecimal` |
| 高精度字段 | 单价、成本分摊、折旧中间计算等**单独定义**精度（如 `DECIMAL(18,6)`），禁止复用金额字段精度 |
| 禁止浮点 | 禁止 `FLOAT`/`DOUBLE` 承载任何财务数值 |
| 内部主键 | `BIGINT` 自增或雪花 ID（待架构师确认），**与业务单据编号分离** |
| 业务单据编号 | 独立业务字段（如 `VARCHAR(32)`），**唯一约束**，一旦正式生成不得因排序、删除其他记录或修改日期而改变 |
| 审计字段 | 每表必备：`created_at DATETIME`、`created_by BIGINT/VARCHAR`、`updated_at DATETIME`、`updated_by`；单据类另含 `biz_date`（业务发生日期）、`pay_date`（实际收付款日期，适用时）、`accounting_period`（会计期间，适用时） |
| 乐观锁 | 业务单据表建议 `version INT`（待架构师确认） |
| 软删除 | 业务单据默认软删除标记 `deleted`；已过账凭证**禁止**修改与物理删除（见 `ACCOUNTING_RULES.md`） |
| 字符集 | `utf8mb4`；金额以外的枚举使用 `VARCHAR` + 应用层枚举校验 |

## 3. 核心实体草案

> 以下字段为草案示意，主键/审计字段未逐一重复列出；`id` 均指内部主键。

### 3.1 资金与基础资料

**资金账户 `tst_fund_account`**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | BIGINT | 内部主键 |
| account_no | VARCHAR(32) | 账户编号，唯一 |
| account_name | VARCHAR(128) | 账户名称（现金/银行/微信/支付宝等） |
| account_type | VARCHAR(32) | 账户类型 |
| currency | VARCHAR(8) | 本位币固定 `CNY` |
| opening_balance | DECIMAL(18,2) | 期初余额 |
| status | VARCHAR(16) | 启用/停用 |

**资金流水 `tst_fund_transaction`**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | BIGINT | 内部主键 |
| transaction_no | VARCHAR(32) | 流水编号，唯一 |
| account_id | BIGINT | 资金账户（→ tst_fund_account.id） |
| direction | VARCHAR(8) | **IN / OUT**（单条账户流水方向二选一） |
| amount | DECIMAL(18,2) | 金额（正数） |
| biz_date | DATE | 业务发生日期 |
| pay_date | DATE | 实际收付款日期 |
| counterparty_type | VARCHAR(32) | 对手方类型（客户/供应商/股东/内部） |
| source_type / source_id | VARCHAR(32) / BIGINT | 来源单据类型与 ID（回溯链） |

**内部转账模型（统一描述，待架构师确认具体落库）**：

- 单条账户流水方向为 IN 或 OUT。
- 内部转账作为独立业务单据。
- 一笔内部转账对应来源账户 OUT 和目标账户 IN 两条关联流水。
- 两条流水金额相等，事务原子提交。
- 内部转账不产生营业收入、费用或整体资金净变化。
| remark | VARCHAR(255) | 备注 |

**客户 `mst_customer`**：id、customer_no（唯一）、name、contact、phone、address、status + 审计字段。
**供应商 `mst_supplier`**：id、supplier_no（唯一）、name、contact、phone、address、status + 审计字段。

### 3.2 应收（receivable / receipt / receipt_allocation 三表模型）

**应收单 `rec_receivable`**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | BIGINT | 内部主键 |
| receivable_no | VARCHAR(32) | 单据编号，唯一 |
| customer_id | BIGINT | → mst_customer.id |
| biz_date | DATE | 业务发生日期 |
| total_amount | DECIMAL(18,2) | 应收金额 |
| outstanding_amount | DECIMAL(18,2) | 未核销余额（可重算校验） |
| status | VARCHAR(16) | 待收款/部分核销/已核销/已冲销/坏账 |
| source_type / source_id | VARCHAR(32) / BIGINT | 来源（如加工费对账单） |

**收款单 `rec_receipt`**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | BIGINT | 内部主键 |
| receipt_no | VARCHAR(32) | 单据编号，唯一 |
| customer_id | BIGINT | → mst_customer.id |
| account_id | BIGINT | 入账资金账户 |
| receipt_amount | DECIMAL(18,2) | 收款金额 |
| allocated_amount | DECIMAL(18,2) | 已核销金额；未分配部分按预收/未分配规则处理 |
| pay_date | DATE | 实际到账日期 |
| fund_transaction_id | BIGINT | 对应资金流水（**一笔收款只记一次资金流入**） |

**核销明细 `rec_receipt_allocation`**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | BIGINT | 内部主键 |
| allocation_no | VARCHAR(32) | 核销编号，唯一 |
| receipt_id | BIGINT | → rec_receipt.id |
| receivable_id | BIGINT | → rec_receivable.id |
| allocated_amount | DECIMAL(18,2) | 本次核销金额 |
| allocation_date | DATE | 核销日期 |

关系：`receipt` ↔ `receivable` **多对多**，由 `receipt_allocation` 承载；约束（草案）：单笔核销金额 > 0，且累计核销金额不得超过收款单金额与应收单余额。

### 3.3 应付（对称结构）

- **应付单 `pay_payable`**：payable_no（唯一）、supplier_id、biz_date、total_amount、outstanding_amount、status、来源单据。
- **付款单 `pay_payment`**：payment_no（唯一）、supplier_id、account_id、payment_amount、allocated_amount、pay_date、fund_transaction_id。
- **付款核销 `pay_payment_allocation`**：payment_id、payable_id、allocated_amount、allocation_date（编号唯一）。

### 3.4 股东往来 `shr_shareholder_transaction`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | BIGINT | 内部主键 |
| transaction_no | VARCHAR(32) | 编号，唯一 |
| shareholder_name | VARCHAR(64) | 股东标识（实体建模待架构师确认） |
| tx_type | VARCHAR(32) | 出资 / 借款 / 垫资 / 分红 / 还款 |
| amount | DECIMAL(18,2) | 金额 |
| biz_date | DATE | 业务日期 |
| account_id | BIGINT | 关联资金账户（适用时） |

### 3.5 固定资产 `fa_fixed_asset`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | BIGINT | 内部主键 |
| asset_no | VARCHAR(32) | 资产编号，唯一 |
| asset_name | VARCHAR(128) | 名称 |
| category | VARCHAR(64) | 类别 |
| original_value | DECIMAL(18,2) | 原值 |
| residual_rate | DECIMAL(9,6) | 残值率（**高精度字段单独定义**示例） |
| useful_life_months | INT | 使用寿命（月） |
| depreciation_method | VARCHAR(32) | 折旧方法（待架构师确认） |
| acquire_date | DATE | 入账日期 |
| status | VARCHAR(16) | 使用中/已处置 |

折旧明细表（`fa_depreciation_entry`，计划于 Phase 4）待架构师确认。

### 3.6 会计凭证与分录

**凭证 `acc_voucher`**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | BIGINT | 内部主键 |
| voucher_no | VARCHAR(32) | 凭证编号，唯一 |
| accounting_period | VARCHAR(16) | 会计期间（如 2026-11） |
| biz_date | DATE | 业务日期 |
| voucher_type | VARCHAR(32) | 收/付/转/自动 |
| status | VARCHAR(16) | 草稿/已过账/已冲销 |
| source_type / source_id | VARCHAR(32) / BIGINT | 来源业务单据（可追溯） |
| total_debit / total_credit | DECIMAL(18,2) | 借贷合计（过账校验相等） |

**分录 `acc_voucher_entry`**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | BIGINT | 内部主键 |
| voucher_id | BIGINT | → acc_voucher.id |
| entry_no | INT | 凭证内序号 |
| account_code | VARCHAR(32) | 科目编码（科目表待架构师确认） |
| summary | VARCHAR(255) | 摘要 |
| debit_amount | DECIMAL(18,2) | 借方金额（默认 0） |
| credit_amount | DECIMAL(18,2) | 贷方金额（默认 0） |

约束（草案）：**借方金额与贷方金额必须且只能有一方大于零，另一方等于零**；同一凭证 `SUM(debit) = SUM(credit)`；已过账凭证的分录不可 UPDATE/DELETE，更正通过冲销凭证（`reversal_of_voucher_id` 关联，待架构师确认）。

## 4. 实体关系概览

```text
mst_customer ──< rec_receivable ──┐
                rec_receipt ──────┼── rec_receipt_allocation（多对多）
mst_supplier ──< pay_payable ─────┐
                pay_payment ──────┼── pay_payment_allocation（多对多）

tst_fund_account ──< tst_fund_transaction（收付款/转账流水，每笔收款仅一条）
rec_receipt / pay_payment ──引用──> tst_fund_transaction

业务单据（应收/收款/应付/付款/费用/股东往来/固定资产）──驱动──> acc_voucher ──< acc_voucher_entry
```

## 5. 待确认事项（数据库）

1. 主键生成策略（自增 vs 雪花 ID）与单据编号生成规则（前缀 + 日期 + 序列，序列连续性要求）。
2. 会计科目表结构、科目编码规则。
3. 余额类字段（`outstanding_amount`、账户余额缓存）与重算对账机制的落库方式。
4. 预收款/未分配收款、退款、坏账、折扣、冲销的具体表结构与状态机。
5. 费用、加工费对账单、工资单等表结构（对应 Phase 1/2 业务确定后补充）。
6. 期初余额迁移表与迁移校验方案（待架构师确认）。
7. 附件（`attachment`）与审计日志（`audit`）表结构。
8. 分区、归档、大表性能策略（当前规模暂不需要，待架构师确认）。
9. **账户间转账（内部转账）**：内部转账作为独立业务单据；一笔内部转账对应来源账户 OUT 和目标账户 IN 两条关联流水，两条流水金额相等、事务原子提交，不产生营业收入、费用或整体资金净变化。具体表结构与约束待架构师确认。
10. **会计分录单边性**：借方金额与贷方金额必须且只能有一方大于零，另一方等于零（禁止双边同时为正、禁止双边同时为零），约束落库方式（CHECK 约束或应用层强校验）待架构师确认。
11. **软删除与撤销/冲销规则**：已确认财务业务不得通过软删除绕过撤销及冲销规则；作废/更正必须走冲销凭证或明确的撤销流程并留痕，具体状态机待架构师确认。
12. **Phase 1/2 数据持久化机制**：在接收真实财务数据之前，必须确定完整的业务事实持久化、幂等、撤销、审计及后续凭证生成机制（与 `ACCOUNTING_RULES.md` 第 6.3 节一致），方案待架构师确认。
13. **模块归属与阶段标记**：基础资金管理（`treasury`/`masterdata`/`identity`/`expense`，Phase 1）与应收应付（`receivable`/`payable`/`shareholder`，Phase 2）的模块归属见 `DEVELOPMENT_ROADMAP.md` 模块归属表，导航阶段标记与路线图保持一致（如调整须同步两处）。
