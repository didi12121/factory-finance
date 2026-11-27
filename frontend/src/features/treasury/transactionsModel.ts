/**
 * 资金流水页面视图模型（纯函数，不含渲染逻辑）—— Agent E / P02-E。
 *
 * 职责：筛选状态 → 查询契约映射、汇总口径计算、业务标签、交易详情结构、金额列排序取值。
 *
 * 财务红线：
 * - 唯一数据源为 usePrototypeStore（页面经 Store 读取，本模块只做展示层推导）；
 * - 金额一律 DecimalString；汇总运算走 `@/utils/decimal`（BigInt 定点）与
 *   prototype/domain/amounts 的精确累加，禁止 Number/parseFloat 参与财务运算；
 * - 净流入 = 资金流入 − 资金流出（subtractAmounts）；
 * - 单条流水金额恒正，收付方向由 direction 表达；
 * - 业务类型 ≠ 收入概念：加工费回款 IN ≠ 营业收入、股东出资 IN ≠ 营业收入、
 *   内部转账 ≠ 收支（账户间划转不产生收支）。
 *
 * 汇总口径（必须显式说明统计范围，见 scopeText）：
 * - 筛选单账户 → 按该账户真实 IN/OUT 统计（含内部转账的账户间划转，对该账户是真实资金变动）；
 * - 未选账户（工厂整体）→ 外部收付口径，**排除内部转账**（成对划转重复计入流入/流出，
 *   且账户间划转不产生收支，整体资金净变化为 0）；
 * - 仅计已入账（RECORDED）流水，已作废（VOIDED）不参与余额重算也不计入汇总。
 */

import { subtractAmounts, type DecimalString } from '@/utils/decimal'
import { canonicalAmount2, sumAmounts } from '@/features/prototype/domain/amounts'
import { formatOperationDateTime } from '@/components/ui/date'
import type {
  EntityId,
  FundSourceDocType,
  FundTransaction,
  FundTransactionListQuery,
  FundTransactionStatus,
  LocalDate,
  ReceiptDetail,
  ReceivableView,
  TransactionDirection,
  TransactionType,
} from '@/features/prototype/contracts'

/* ------------------------------- 筛选状态 ------------------------------- */

/** 方向筛选：ALL 不限 / IN 流入 / OUT 流出 / TRANSFER 内部转账（业务类型维度的快捷筛选） */
export type DirectionFilter = 'ALL' | 'IN' | 'OUT' | 'TRANSFER'

/** Select 统一"不限"哨兵值（reka-ui SelectItem 不接受空字符串 value） */
export const ALL = 'ALL' as const

/** 资金流水筛选状态（FilterToolbar 的真实过滤条件） */
export interface TransactionsFilterState {
  /** 关键字（流水编号 / 交易对手 / 备注，语义与查询契约一致） */
  keyword: string
  /** 交易日期起（YYYY-MM-DD；空串表示不限） */
  dateFrom: LocalDate | ''
  /** 交易日期止（YYYY-MM-DD；空串表示不限） */
  dateTo: LocalDate | ''
  /** 资金账户（ALL = 全部） */
  accountId: EntityId | 'ALL'
  /** 业务类型（ALL = 全部） */
  transactionType: TransactionType | 'ALL'
  /** 流水方向（ALL / IN / OUT / TRANSFER） */
  direction: DirectionFilter
}

/** 初始筛选状态（全部不限） */
export function emptyFilterState(): TransactionsFilterState {
  return {
    keyword: '',
    dateFrom: '',
    dateTo: '',
    accountId: ALL,
    transactionType: ALL,
    direction: ALL,
  }
}

/** 是否存在生效筛选（清空筛选按钮的可用态） */
export function hasActiveFilters(filters: TransactionsFilterState): boolean {
  return (
    filters.keyword.trim() !== '' ||
    filters.dateFrom !== '' ||
    filters.dateTo !== '' ||
    filters.accountId !== ALL ||
    filters.transactionType !== ALL ||
    filters.direction !== ALL
  )
}

/** 类型收窄：Select 回传字符串 → 业务类型 / ALL */
export function isTransactionTypeValue(value: string): value is TransactionType | 'ALL' {
  return value === ALL || Object.prototype.hasOwnProperty.call(TRANSACTION_TYPE_LABELS, value)
}

/** 类型收窄：Select 回传字符串 → 方向筛选 */
export function isDirectionFilter(value: string): value is DirectionFilter {
  return value === ALL || value === 'IN' || value === 'OUT' || value === 'TRANSFER'
}

/**
 * 筛选状态 → 查询契约（FundTransactionListQuery）。
 *
 * 映射约定：
 * - 关键字/日期/账户/业务类型直接映射查询契约同名字段（过滤语义由契约实现保证）；
 * - 方向 IN/OUT 映射 `direction`；方向"内部转账"映射 `transactionType = INTERNAL_TRANSFER`
 *   （内部转账是业务类型维度，不是收付方向）；
 * - 方向"内部转账"与业务类型筛选冲突（业务类型 ≠ 内部转账）时返回 null：
 *   结果确定为空，不再发起查询（避免构造互相矛盾的查询参数）。
 */
export function resolveTransactionQuery(
  filters: TransactionsFilterState,
): FundTransactionListQuery | null {
  if (filters.direction === 'TRANSFER' && filters.transactionType !== ALL && filters.transactionType !== 'INTERNAL_TRANSFER') {
    return null
  }
  const query: FundTransactionListQuery = { page: 1, size: 500 }
  const keyword = filters.keyword.trim()
  if (keyword !== '') {
    query.keyword = keyword
  }
  if (filters.dateFrom !== '' || filters.dateTo !== '') {
    query.dateRange = {
      from: filters.dateFrom === '' ? null : filters.dateFrom,
      to: filters.dateTo === '' ? null : filters.dateTo,
    }
  }
  if (filters.accountId !== ALL) {
    query.accountId = filters.accountId
  }
  if (filters.direction === 'IN' || filters.direction === 'OUT') {
    query.direction = filters.direction
  }
  if (filters.direction === 'TRANSFER') {
    query.transactionType = 'INTERNAL_TRANSFER'
  } else if (filters.transactionType !== ALL) {
    query.transactionType = filters.transactionType
  }
  return query
}

/* --------------------------------- 标签 --------------------------------- */

/** 业务类型标签（业务性质 ≠ 会计收入概念） */
/** 业务类型标准标签：统一来自契约单一来源（V1.1，F-002 整改），禁止本地定义 */
import { TRANSACTION_TYPE_LABELS } from '@/features/prototype/contracts/labels'

export { TRANSACTION_TYPE_LABELS }

/** 来源单据类型标签（回溯链） */
export const SOURCE_DOC_TYPE_LABELS: Record<FundSourceDocType, string> = {
  RECEIPT: '收款单',
  EXPENSE: '费用单',
  PAYROLL: '工资单',
  PURCHASE: '采购单',
  SHAREHOLDER_TRANSACTION: '股东往来单',
  INTERNAL_TRANSFER: '内部转账单',
}

/** 流水状态标签（FinancialStatus 同时输出文字 + 语义色，禁止仅靠颜色区分） */
export const TRANSACTION_STATUS_LABELS: Record<FundTransactionStatus, string> = {
  RECORDED: '已入账',
  VOIDED: '已作废',
}

/** 流水状态语义色（FinancialStatus kind） */
export const TRANSACTION_STATUS_KINDS: Record<FundTransactionStatus, 'success' | 'muted'> = {
  RECORDED: 'success',
  VOIDED: 'muted',
}

/** 收付方向标签（方向二选一，金额恒正） */
export function directionLabel(direction: TransactionDirection): string {
  return direction === 'IN' ? '流入（IN）' : '流出（OUT）'
}

/** 来源单据展示文本（收款单解析为业务单据编号；无来源单据 = 手工录入） */
export function sourceDocText(txn: FundTransaction, receiptNo: string | null): string {
  if (txn.sourceDocType === null) {
    return '手工录入（无来源单据）'
  }
  const label = SOURCE_DOC_TYPE_LABELS[txn.sourceDocType]
  return txn.sourceDocType === 'RECEIPT' && receiptNo !== null ? `${label} ${receiptNo}` : label
}

/* --------------------------------- 汇总 --------------------------------- */

/** 资金汇总（筛选范围口径，金额 DecimalString） */
export interface TransactionSummary {
  /** 资金流入合计（口径内 IN 之和） */
  inflow: DecimalString
  /** 资金流出合计（口径内 OUT 之和） */
  outflow: DecimalString
  /** 净流入 = 流入 − 流出（subtractAmounts，可为负） */
  net: DecimalString
  /** 计入汇总的流水条数（口径内已入账流水） */
  countedRows: number
  /** 统计范围文案（显式说明口径） */
  scopeText: string
  /** 筛选命中条数文案 */
  countText: string
}

/**
 * 计算筛选范围内的资金汇总。
 *
 * @param rows 当前筛选命中的全部流水（含已作废）
 * @param accountName 单账户口径的账户名；null 表示工厂整体口径
 */
export function computeTransactionSummary(
  rows: FundTransaction[],
  accountName: string | null,
): TransactionSummary {
  // 仅已入账（RECORDED）为有效资金事实；工厂整体口径排除内部转账（划转 ≠ 收支）
  const effective = rows.filter(
    (txn) =>
      txn.status === 'RECORDED' &&
      (accountName !== null || txn.transactionType !== 'INTERNAL_TRANSFER'),
  )
  const inflow = sumAmounts(
    effective.filter((txn) => txn.direction === 'IN').map((txn) => txn.amount),
  )
  const outflow = sumAmounts(
    effective.filter((txn) => txn.direction === 'OUT').map((txn) => txn.amount),
  )
  const net = canonicalAmount2(subtractAmounts(inflow, outflow))
  const scopeText =
    accountName !== null
      ? `统计范围：账户「${accountName}」的真实流入/流出（含内部转账账户间划转）；仅计已入账流水，已作废不计入。`
      : '统计范围：工厂整体外部收付（已排除内部转账，账户间划转不产生收支）；仅计已入账流水，已作废不计入。'
  const countText = `当前筛选命中 ${rows.length} 条流水，其中 ${effective.length} 条计入汇总。`
  return { inflow, outflow, net, countedRows: effective.length, scopeText, countText }
}

/* ------------------------------ 金额列排序取值 ------------------------------ */

/**
 * 流入金额列排序取值：IN 流水取金额，其余取 '0'（无流入）。
 * 排序必须使用 compareAmounts 精确比较（列 sortingFn = amountSortingFn）。
 */
export function incomeSortValue(txn: FundTransaction): DecimalString {
  return txn.direction === 'IN' ? txn.amount : '0'
}

/**
 * 流出金额列排序取值：OUT 流水取金额，其余取 '0'（无流出）。
 * 排序必须使用 compareAmounts 精确比较（列 sortingFn = amountSortingFn）。
 */
export function outcomeSortValue(txn: FundTransaction): DecimalString {
  return txn.direction === 'OUT' ? txn.amount : '0'
}

/* --------------------------------- 详情 --------------------------------- */

/** 详情行的渲染类型 */
export type DetailRowKind = 'text' | 'date' | 'money' | 'docNo' | 'status'

/** 详情字段行 */
export interface TransactionDetailRow {
  key: string
  label: string
  /** money 行为 DecimalString 原值（渲染层用 MoneyText 格式化） */
  value: string
  kind: DetailRowKind
  /** status 行的语义色 */
  tone?: 'success' | 'muted'
}

/** 来源收款单回溯（加工费回款流水 → 收款单 → 核销去向） */
export interface TransactionReceiptLink {
  receiptId: EntityId
  receiptNo: string
  customerName: string
  actualAmount: DecimalString
  /** 核销去向（收款单核销的应收单） */
  allocations: Array<{
    receivableId: EntityId
    statementNo: string
    allocationAmount: DecimalString
  }>
}

/** 交易详情结构（DetailSheet 渲染与断言共用） */
export interface TransactionDetailModel {
  rows: TransactionDetailRow[]
  /** 关联流水（内部转账 transferGroupId 派对的另一方向账户流水） */
  transferPartners: FundTransaction[]
  /** 来源收款单回溯；非收款单来源为 null */
  receipt: TransactionReceiptLink | null
}

/** 详情上下文（由 usePrototypeStore 装配，单一数据源） */
export interface TransactionDetailContext {
  accountName: (accountId: EntityId) => string | null
  customerName: (customerId: EntityId) => string | null
  receiptDetailById: (receiptId: EntityId) => ReceiptDetail | null
  receivableViewById: (receivableId: EntityId) => ReceivableView | null
}

/**
 * 构建交易详情模型：全部字段 + 备注 + 关联流水 + 来源收款单回溯。
 *
 * - 内部转账：transferPartners 为同一 transferGroupId 的另一方向账户流水（成对流水）；
 * - 加工费回款（sourceDocType=RECEIPT）：解析收款单编号与核销去向，供跨页跳转；
 * - null 字段统一显示 '—'（禁止空字符串/魔法值表达空）。
 */
export function buildTransactionDetailModel(
  txn: FundTransaction,
  ctx: TransactionDetailContext,
  allTransactions: FundTransaction[],
): TransactionDetailModel {
  const accountName = ctx.accountName(txn.accountId) ?? txn.accountId
  const sourceReceipt =
    txn.sourceDocType === 'RECEIPT' && txn.sourceDocId !== null
      ? ctx.receiptDetailById(txn.sourceDocId)
      : null
  const receiptNo = sourceReceipt?.receipt.receiptNo ?? null

  const rows: TransactionDetailRow[] = [
    { key: 'transactionNo', label: '流水编号', value: txn.transactionNo, kind: 'docNo' },
    { key: 'id', label: '内部标识', value: txn.id, kind: 'text' },
    { key: 'transactionType', label: '业务类型', value: TRANSACTION_TYPE_LABELS[txn.transactionType], kind: 'text' },
    { key: 'tradeDate', label: '交易日期', value: txn.tradeDate, kind: 'date' },
    { key: 'account', label: '资金账户', value: accountName, kind: 'text' },
    { key: 'counterparty', label: '交易对手', value: txn.counterparty ?? '—', kind: 'text' },
    { key: 'direction', label: '收付方向', value: directionLabel(txn.direction), kind: 'text' },
    { key: 'amount', label: '交易金额', value: txn.amount, kind: 'money' },
    { key: 'sourceDoc', label: '来源单据', value: sourceDocText(txn, receiptNo), kind: 'text' },
    { key: 'sourceDocId', label: '来源单据标识', value: txn.sourceDocId ?? '—', kind: 'text' },
    { key: 'transferGroupId', label: '内部转账组', value: txn.transferGroupId ?? '—', kind: 'text' },
    {
      key: 'status',
      label: '流水状态',
      value: TRANSACTION_STATUS_LABELS[txn.status],
      kind: 'status',
      tone: TRANSACTION_STATUS_KINDS[txn.status],
    },
    // 操作时间展示统一 YYYY-MM-DD HH:mm（不向用户暴露 ISO 分隔符等开发术语）
    { key: 'createdAt', label: '创建时间', value: formatOperationDateTime(txn.createdAt), kind: 'date' },
    { key: 'remark', label: '备注', value: txn.remark ?? '—', kind: 'text' },
  ]

  const transferPartners =
    txn.transferGroupId === null
      ? []
      : allTransactions.filter(
          (item) => item.transferGroupId === txn.transferGroupId && item.id !== txn.id,
        )

  let receipt: TransactionReceiptLink | null = null
  if (sourceReceipt !== null) {
    receipt = {
      receiptId: sourceReceipt.receipt.id,
      receiptNo: sourceReceipt.receipt.receiptNo,
      customerName: ctx.customerName(sourceReceipt.receipt.customerId) ?? '—',
      actualAmount: sourceReceipt.receipt.actualAmount,
      allocations: sourceReceipt.allocations.map((allocation) => ({
        receivableId: allocation.receivableId,
        statementNo:
          ctx.receivableViewById(allocation.receivableId)?.receivable.statementNo ??
          allocation.receivableId,
        allocationAmount: allocation.allocationAmount,
      })),
    }
  }

  return { rows, transferPartners, receipt }
}

/** 业务错误消息展开（ErrorState 文案用；保留给查询失败展示） */
export function businessErrorMessage(error: unknown, fallback: string): string {
  if (error !== null && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message !== '') {
      return message
    }
  }
  return fallback
}
