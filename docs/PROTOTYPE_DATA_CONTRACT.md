# Prototype Data Contract V1（已冻结）

> 冻结时间：2026-11-27 10:55（Asia/Shanghai）｜Owner: Development Orchestrator
> 冻结基线：`phase-0.2/integration` @ `2e02acd`
> 状态：**FROZEN** —— Phase 0.2 原型阶段不得改动；任何变更必须提交 Contract Change Request 由主 Agent 裁决。
> 代码位置：`frontend/src/features/prototype/contracts/`（8 个文件，由 Agent B 交付、主 Agent 审核合并）

## 1. 数据类型（`types.ts`）

| 类型 | 定义 | 语义 |
| --- | --- | --- |
| `EntityId` | `string` | 内部唯一 ID（演示层字符串 ID） |
| `DecimalString` | 复用 `@/utils/decimal` | 十进制金额字符串，**禁止 Number/parseFloat 承载财务金额** |
| `LocalDate` | `string`（YYYY-MM-DD） | 业务日期 |
| `AccountingMonth` | `string`（YYYY-MM） | 应收所属月份 |
| `IsoDateTime` | `string` | 创建/操作时间 |
| `CurrencyCode` | `'CNY'` | 单一本位币 |
| `DEMO_TODAY` | `'2026-11-30'` | **统一演示日期基准**（账龄/逾期/趋势统计禁用真实当前时间） |

实体（金额全部 `DecimalString`、日期全部 `LocalDate`/`AccountingMonth`）：

| 实体 | 关键字段与不变量 |
| --- | --- |
| `Customer` | id、name、status(`CustomerStatus=EnableStatus`) |
| `FundAccount` | id、name、accountType(`CASH/BANK/WECHAT/ALIPAY/OTHER`)、openingBalance、enabled |
| `FundTransaction` | id、transactionNo、transactionType、tradeDate、accountId、direction(`IN/OUT`)、**amount 恒为正数**（方向由 direction 表达）、counterparty、sourceDocType、sourceDocId、transferGroupId（内部转账关联 ID，可空）、status(`RECORDED/VOIDED`)、remark、createdAt |
| `Receivable` | id、statementNo、customerId、accountingMonth、statementDate、dueDate(可空)、originalAmount、remark、createdAt。**已收/未收/状态/逾期不冗余存储**，由核销明细派生 |
| `Receipt` | id、receiptNo、customerId、receiptDate、accountId、actualAmount、fundTransactionId、externalRef、remark、**idempotencyKey** |
| `ReceiptAllocation` | id、receiptId、receivableId、allocationAmount、allocatedAt |

派生统计：`ReceivableSummary`（paidAmount/outstandingAmount/status/**isOverdue 独立属性**/asOf）、`ReceivableView`（Receivable + Summary）、`DashboardPeriod`、`CashFlowTrendPoint`、`ExpenseCategoryStat`、`DashboardSummary`（当前资金余额、当前应收余额、期间加工收入、期间实际回款、期间实际支出、资金收付趋势、支出分类、近期流水、待收单据、逾期应收余额——全 DecimalString/结构化）。

## 2. 公开接口（`repository.ts`，Promise 契约）

`PrototypeRepository`（Phase 0.2 由 Mock Store 实现；后续由真实 API 同接口实现，页面层无感知替换）：

```text
listCustomers / listFundAccounts / listFundTransactions
listReceivables / getReceivableById / listReceivableAllocations
listReceipts / getReceiptById（ReceiptDetail：收款单 + 其核销明细）
getDashboardSummary
createReceivable
previewReceiptAllocation / autoAllocateReceipt / validateReceiptAllocation / confirmReceipt
```

写操作红线（实现必须满足）：同事务语义一次性提交、幂等、**一笔收款只产生一条资金流入**、核销不产生新资金流水、禁止物理删除已确认记录、失败操作零状态变化。

## 3. 财务业务不变量

```text
营业收入 != 实际回款；经营费用 != 实际付款
股东出资 != 营业收入；股东借款 != 所有者权益
账户间转账 != 收入/费用（整体资金净变化为 0）
资金余额 = 期初余额 + 有效 IN − 有效 OUT（可重算）
应收余额 = 原始应收金额 − 有效核销金额
实际收款金额 > 0；每条有效核销金额 > 0
全部核销金额 <= 实际收款金额
单张应收单累计有效核销金额 <= 原始应收金额
不得跨客户核销；不得核销已结清/不存在应收单；重复分配项直接拒绝
仅"累计分配 = 实际收款"的收款允许确认（预收款/未分配收款留待 Phase 2）
回款确认原子提交；失败 → 收款单/流水/核销/余额/收入全部不变
幂等键唯一：同键重复提交不产生第二张收款单/第二条流水/重复核销；同键不同参数拒绝
回款状态由核销明细派生（UNPAID/PARTIALLY_PAID/SETTLED）；逾期为独立派生属性
```

## 4. 查询与筛选契约（`query.ts`）

- 分页 `PageQuery`/`PageResult` 复用 `@/types/api`（与后端 API_CONTRACT 对齐：page≥1、size 1–500、items/total/page/size）。
- 排序 `SortSpec{key, direction:'ASC'|'DESC'}`；**金额排序必须用 `compareAmounts` 精确比较**。
- `LocalDateRange{from?, to?}`；四组筛选：CustomerListQuery / FundAccountListQuery / FundTransactionListQuery（关键字、日期范围、账户、业务类型、方向）/ ReceivableListQuery（客户、月份、状态、逾期、关键字）/ ReceiptListQuery（客户、账户、日期、关键字）。

## 5. 日期语义

- `DEMO_TODAY = '2026-11-30'` 为账龄/逾期/趋势的统一大基准；禁止使用浏览器本地时间参与财务派生计算。
- 期间加工收入按应收单 `accountingMonth` 归属；实际收付款/趋势按 `tradeDate`/`receiptDate` 统计；部分月份区间不得把整月应收误认为按天收入。
- 余额类指标标注"当前余额"，不因期间筛选变成期间发生额。

## 6. 跨页面导航契约（`navigation.ts`，冻结）

```text
/business/processing-fee?action=create[&customerId=...][&receivableId=...]
```

- 唯一回款流程入口：应收页（Agent F）只经 `buildProcessingFeeCreatePath()` 进入回款登记（Agent G），禁止手拼路径字符串、禁止 F 自建回款表单/引擎。
- 参数顺序冻结：`action` → `customerId` → `receivableId`；缺省参数省略。

## 7. 错误处理（`errors.ts`）

`BusinessError{code: BusinessErrorCode, message, fieldErrors?}`：业务校验失败（非法金额、超额核销、跨客户、重复分配、无效账户、未分配余额、幂等冲突等）以统一错误返回；UI 层展示 message/fieldErrors，Store 层校验为最终防线（UI 校验不可替代）。

## 8. 文件所有权（Single Writer）

| 范围 | 所有者 |
| --- | --- |
| `contracts/**`（冻结后） | 主 Agent（变更走 Contract Change Request） |
| `features/prototype/{data,domain,repository,stores,tests}/**` | Agent C |
| `features/dashboard/**` | Agent D |
| `features/treasury/**` | Agent E |
| `features/receivables/**` | Agent F |
| `features/receipts/**` | Agent G |
| router/navigation/styles/docs/CI | 主 Agent |

## 9. 版本

```text
PROTOTYPE_CONTRACT = V1 (FROZEN)
冻结提交 = 2e02acd（phase-0.2/integration）
```
