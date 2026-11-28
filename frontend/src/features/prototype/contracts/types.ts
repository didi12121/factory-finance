/**
 * Prototype Contract V1（V1.2 增量：ReceivableSummary.integrity 完整性诊断字段，
 * 见 ReceivableIntegrityDiagnostic）— 基础类型与实体（共享数据契约，不实现业务逻辑）。
 *
 * 金额红线：
 * - 所有金额字段一律 `DecimalString`（十进制字符串，DECIMAL(18,2) 业务金额：
 *   整数位 ≤ 16 位、小数位 ≤ 2 位），禁止用 Number/parseFloat 承载财务金额；
 * - 精确运算与比较使用 `@/utils/decimal.ts`（BigInt 定点），比较用 `compareAmounts`。
 *
 * 日期红线：
 * - 业务日期一律 `LocalDate`（YYYY-MM-DD 字符串），会计期间一律 `AccountingMonth`（YYYY-MM）；
 * - 派生计算（账龄/逾期/看板）统一以 `DEMO_TODAY` 为基准，禁止使用真实当前时间。
 *
 * 空值语义：字段标注 `| null` 的可空；未标注的非空。`null` 一律表示"无值/未约定"，
 * 禁止用空字符串或魔法值表达空。
 */

import type {
  CustomerStatus,
  FundAccountType,
  FundSourceDocType,
  FundTransactionStatus,
  ReceivableStatus,
  TransactionDirection,
  TransactionType,
} from './enums'
import type { DecimalString } from '@/utils/decimal'

/** 财务金额十进制字符串（复用 utils/decimal.ts 的定义，禁止 Number 承载财务金额） */
export type { DecimalString } from '@/utils/decimal'

/** 内部主键（仅做技术标识，与业务单据编号分离；字符串承载） */
export type EntityId = string

/** 业务日期（YYYY-MM-DD 字符串） */
export type LocalDate = string

/** 会计期间（YYYY-MM 字符串） */
export type AccountingMonth = string

/** ISO 8601 日期时间字符串（如 '2026-11-30T10:00:00'），用于 createdAt/allocatedAt 等审计时间 */
export type IsoDateTime = string

/** 币种（第一版仅人民币本位币） */
export type CurrencyCode = 'CNY'

/**
 * 统一演示日期基准常量：账龄、逾期、看板等派生计算的稳定基准日。
 * 原型阶段所有派生计算必须以此为基准（保证演示数据可重放、断言稳定），
 * **禁止使用真实当前时间**。
 */
export const DEMO_TODAY: LocalDate = '2026-11-30'

/** 客户（主数据） */
export interface Customer {
  /** 内部主键 */
  id: EntityId
  /** 客户名称（演示数据为虚构名称） */
  name: string
  /** 启用状态：停用客户不可用于新单据，历史单据保留 */
  status: CustomerStatus
}

/** 资金账户 */
export interface FundAccount {
  /** 内部主键 */
  id: EntityId
  /** 账户名称（现金/银行/微信/支付宝等） */
  name: string
  /** 账户类型 */
  accountType: FundAccountType
  /**
   * 期初余额（DECIMAL(18,2) 十进制字符串）。
   * 不变量：账户余额 = 期初余额 + Σ有效流入 − Σ有效流出（可由流水重算核对）。
   */
  openingBalance: DecimalString
  /** 账户启用状态（true=启用/false=停用）：停用账户不可新增流水，历史流水保留 */
  enabled: boolean
}

/** 资金流水（单条账户收付/转账记录） */
export interface FundTransaction {
  /** 内部主键 */
  id: EntityId
  /** 流水编号（业务单据编号，唯一且不可变） */
  transactionNo: string
  /** 业务交易类型 */
  transactionType: TransactionType
  /** 业务发生日期 */
  tradeDate: LocalDate
  /** 所属资金账户 */
  accountId: EntityId
  /** 方向：IN 流入 / OUT 流出 */
  direction: TransactionDirection
  /**
   * 金额（DECIMAL(18,2) 十进制字符串）。
   * 不变量：**单条流水金额恒为正数**，收付方向由 direction 表达，禁止用负数表达流出。
   */
  amount: DecimalString
  /** 对手方（客户/供应商/股东/内部账户等）；内部转账可为 null */
  counterparty: string | null
  /** 来源单据类型；与 sourceDocId 成对出现，null 表示无来源单据的手工录入流水 */
  sourceDocType: FundSourceDocType | null
  /** 来源单据 ID；与 sourceDocType 成对出现（同为 null 或同为非 null） */
  sourceDocId: EntityId | null
  /**
   * 内部转账关联 ID：同一笔内部转账的 OUT/IN 两条流水共享同一值（两条金额相等、事务原子提交）；
   * 非内部转账流水为 null。内部转账不产生营业收入、费用或整体资金净变化。
   */
  transferGroupId: EntityId | null
  /** 流水状态：VOIDED 不参与余额重算；更正必须走明确撤销/冲销流程（禁止物理删除） */
  status: FundTransactionStatus
  /** 备注；null 表示无备注 */
  remark: string | null
  /** 创建时间（审计字段） */
  createdAt: IsoDateTime
}

/**
 * 应收单（债权，来源如加工费对账单）。
 *
 * 不变量：
 * - **单张应收累计核销 ≤ 原始应收金额**；
 * - 已收/未收金额、回款状态、是否逾期均由核销明细派生（见 ReceivableSummary），
 *   **不在本实体冗余存储**。
 */
export interface Receivable {
  /** 内部主键 */
  id: EntityId
  /** 对账单编号（业务单据编号，唯一且不可变） */
  statementNo: string
  /** 客户 */
  customerId: EntityId
  /** 会计期间（YYYY-MM，账龄/逾期派生计算的期间维度） */
  accountingMonth: AccountingMonth
  /** 对账日期（业务日期） */
  statementDate: LocalDate
  /** 到期日；null 表示未约定到期日（**不得据此判定逾期**） */
  dueDate: LocalDate | null
  /** 原始应收金额（DECIMAL(18,2) 十进制字符串） */
  originalAmount: DecimalString
  /** 备注；null 表示无备注 */
  remark: string | null
  /** 创建时间（审计字段） */
  createdAt: IsoDateTime
}

/**
 * 收款单（资金流入事实）。
 *
 * 不变量：
 * - **一笔实际收款只记一次资金流入**（fundTransactionId 唯一关联一条资金流水），
 *   禁止因核销多张应收而重复计入资金余额；
 * - **核销总额 ≤ 实际收款金额**（未分配部分按预收/未分配规则处理，规则待架构师确认）。
 */
export interface Receipt {
  /** 内部主键 */
  id: EntityId
  /** 收款单编号（业务单据编号，唯一且不可变） */
  receiptNo: string
  /** 客户 */
  customerId: EntityId
  /** 实际到账日期（资金事实日期，区别于对账日期 statementDate） */
  receiptDate: LocalDate
  /** 入账资金账户 */
  accountId: EntityId
  /** 实际收款金额（DECIMAL(18,2) 十进制字符串） */
  actualAmount: DecimalString
  /** 对应资金流水 ID（一笔收款只记一次资金流入） */
  fundTransactionId: EntityId
  /** 外部参考号（如银行流水号）；null 表示无 */
  externalRef: string | null
  /** 备注；null 表示无备注 */
  remark: string | null
  /**
   * 幂等键：同一键的确认请求重复提交不得重复生成收款单/资金流水/核销明细
   * （幂等键设计方案待架构师确认，本字段为契约占位）。
   */
  idempotencyKey: string
}

/**
 * 核销明细（收款单 ↔ 应收单 的多对多匹配）。
 *
 * 不变量：
 * - 单笔核销金额 > 0；
 * - 单张应收累计核销 ≤ 原始应收金额；
 * - 单张收款单累计核销 ≤ 实际收款金额；
 * - 核销本身不产生新的资金流水。
 */
export interface ReceiptAllocation {
  /** 内部主键 */
  id: EntityId
  /** 收款单 */
  receiptId: EntityId
  /** 应收单 */
  receivableId: EntityId
  /** 本次核销金额（DECIMAL(18,2) 十进制字符串） */
  allocationAmount: DecimalString
  /** 核销时间（审计字段） */
  allocatedAt: IsoDateTime
}

/**
 * 应收完整性诊断（V1.2 契约新增，可选字段 `ReceivableSummary.integrity`）。
 *
 * 语义：派生层对「有效核销合计 > 原始应收」等数据异常的**显式暴露**，
 * 禁止静默钳制掩盖异常（展示口径 outstandingAmount 仍恒 ≥ 0，但异常必须被标记）。
 * 原始业务事实（原始应收、实际核销合计）保留不变，派生值与异常标记并存。
 * 写时校验（create/confirm 拒绝超额核销）仍是第一道防线，本诊断为派生层防御性暴露。
 */
export interface ReceivableIntegrityDiagnostic {
  /** OK = 有效核销合计 ≤ 原始应收；OVER_ALLOCATED = 超额核销（数据异常） */
  status: 'OK' | 'OVER_ALLOCATED'
  /** 超额差额 = 有效核销合计 − 原始应收（DECIMAL(18,2)，恒 ≥ 0；OK 时 '0.00'） */
  overAllocatedAmount: DecimalString
}

/**
 * 应收派生统计（由核销明细汇总派生，禁止冗余存储在应收实体）。
 * 逾期是独立派生属性，与回款状态（ReceivableStatus）互不替代。
 */
export interface ReceivableSummary {
  /** 已收金额 = Σ该应收单的核销明细金额（DECIMAL(18,2)；超额核销时保留真实合计，不截断） */
  paidAmount: DecimalString
  /**
   * 未收金额 = 原始应收金额 − 已收金额（DECIMAL(18,2)，展示口径恒 ≥ 0）。
   * 超额核销时展示为 '0.00' 但**不得据此认定数据正常**——异常由 integrity 显式标记。
   */
  outstandingAmount: DecimalString
  /** 回款状态：UNPAID / PARTIALLY_PAID / SETTLED（由已收金额派生） */
  status: ReceivableStatus
  /** 是否逾期（派生属性）：dueDate 非空 且 asOf > dueDate 且未结清；dueDate 为 null 恒为 false */
  isOverdue: boolean
  /** 派生计算基准日（统一使用 DEMO_TODAY，禁止真实当前时间） */
  asOf: LocalDate
  /** 完整性诊断（V1.2 新增，可选）：超额核销等异常的显式暴露；派生实现恒提供 */
  integrity?: ReceivableIntegrityDiagnostic
}

/** 应收组合视图（实体 + 派生统计，供列表/详情直接使用） */
export interface ReceivableView {
  receivable: Receivable
  summary: ReceivableSummary
}

/** 看板统计期间（闭区间，from ≤ to） */
export interface DashboardPeriod {
  from: LocalDate
  to: LocalDate
}

/** 资金收付趋势点（按日聚合实际资金收付） */
export interface CashFlowTrendPoint {
  /** 日期 */
  date: LocalDate
  /** 当日实际流入合计（DECIMAL(18,2)） */
  inflow: DecimalString
  /** 当日实际流出合计（DECIMAL(18,2)） */
  outflow: DecimalString
}

/** 支出分类统计（实际支出按业务类型聚合） */
export interface ExpenseCategoryStat {
  /** 支出分类代码（展示层经 TRANSACTION_TYPE_LABELS 解析标签，未知值回退原值） */
  category: string
  /** 分类支出合计（DECIMAL(18,2)） */
  amount: DecimalString
}

/**
 * 看板汇总（派生统计）。
 *
 * 业务与财务分离（红线）：
 * - 期间加工收入 = 权责发生制收入（期间加工费应收原始金额合计），**≠ 实际回款**；
 * - 期间实际回款/期间实际支出 = 资金事实（资金流水合计），**≠ 收入/费用确认**；
 * - 所有金额均为 DECIMAL(18,2) 十进制字符串。
 */
export interface DashboardSummary {
  /** 派生计算基准日（DEMO_TODAY） */
  asOf: LocalDate
  /** 统计期间 */
  period: DashboardPeriod
  /** 当前资金余额（Σ账户余额；= Σ期初余额 + Σ有效流入 − Σ有效流出，可重算核对） */
  totalFundBalance: DecimalString
  /** 当前应收余额（Σ未收金额） */
  totalReceivableOutstanding: DecimalString
  /** 期间加工收入（权责发生制，≠ 实际回款） */
  periodProcessingFeeIncome: DecimalString
  /** 期间实际回款（资金事实） */
  periodActualReceipts: DecimalString
  /** 期间实际支出（资金事实） */
  periodActualExpenses: DecimalString
  /** 资金收付趋势（按日） */
  cashFlowTrend: CashFlowTrendPoint[]
  /** 支出分类（按业务类型） */
  expenseBreakdown: ExpenseCategoryStat[]
  /** 近期资金流水（按业务日期倒序，条数由实现约定） */
  recentTransactions: FundTransaction[]
  /** 待收单据（未结清应收，含派生统计） */
  pendingReceivables: ReceivableView[]
  /** 逾期应收余额（逾期且未收合计） */
  overdueReceivableOutstanding: DecimalString
}
