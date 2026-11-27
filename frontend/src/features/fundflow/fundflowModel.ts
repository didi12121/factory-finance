/**
 * 资金流水页面视图模型（纯函数）：筛选 → 查询映射、详情装配（来源单据 + 撤销信息）。
 *
 * 红线：
 * - 金额一律 DecimalString，展示走 MoneyText/formatAmount，禁止 Number 财务运算；
 * - 单条流水金额恒正，收付方向由 direction 表达；
 * - 业务类型 ≠ 收入概念（加工费回款 IN ≠ 营业收入；股东出资 IN ≠ 营业收入；内部转账 ≠ 收支）；
 * - 只读列表：禁止物理删除流水；撤销走业务单据的明确撤销流程（反向流水）。
 */

import {
  directionLabel,
  sourceDocTypeLabel,
  transactionTypeLabel,
  TRANSACTION_STATUS_KINDS,
  TRANSACTION_STATUS_LABELS,
  TRANSACTION_TYPE_LABELS,
  type FundTransaction,
  type LocalDate,
  type TransactionQuery,
  type TransactionType,
} from '@/services/api'

export { TRANSACTION_TYPE_LABELS }

/** Select 统一「不限」哨兵值（reka-ui SelectItem 不接受空字符串 value） */
export const ALL = 'ALL' as const

/** 方向筛选：ALL 不限 / IN 流入 / OUT 流出 / TRANSFER 内部转账（业务类型维度快捷筛选） */
export type DirectionFilter = 'ALL' | 'IN' | 'OUT' | 'TRANSFER'

/** 资金流水筛选状态 */
export interface FundflowFilterState {
  keyword: string
  dateFrom: LocalDate | ''
  dateTo: LocalDate | ''
  accountId: string | typeof ALL
  transactionType: TransactionType | typeof ALL
  direction: DirectionFilter
}

export function emptyFundflowFilters(): FundflowFilterState {
  return {
    keyword: '',
    dateFrom: '',
    dateTo: '',
    accountId: ALL,
    transactionType: ALL,
    direction: ALL,
  }
}

export function hasActiveFundflowFilters(filters: FundflowFilterState): boolean {
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
export function isTransactionTypeValue(value: string): value is TransactionType | typeof ALL {
  return value === ALL || Object.prototype.hasOwnProperty.call(TRANSACTION_TYPE_LABELS, value)
}

/** 类型收窄：Select 回传字符串 → 方向筛选 */
export function isDirectionFilter(value: string): value is DirectionFilter {
  return value === ALL || value === 'IN' || value === 'OUT' || value === 'TRANSFER'
}

/**
 * 筛选状态 → 服务端查询参数（分页 + 筛选）。
 *
 * 映射约定：
 * - 方向 IN/OUT 映射 `direction`；方向「内部转账」映射 `transactionType = INTERNAL_TRANSFER`
 *   （内部转账是业务类型维度，不是收付方向）；
 * - 方向「内部转账」与业务类型筛选冲突时返回 null：结果确定为空，不发起查询。
 */
export function resolveTransactionQuery(
  filters: FundflowFilterState,
  page: number,
  size: number,
): TransactionQuery | null {
  if (
    filters.direction === 'TRANSFER' &&
    filters.transactionType !== ALL &&
    filters.transactionType !== 'INTERNAL_TRANSFER'
  ) {
    return null
  }
  const query: TransactionQuery = { page, size }
  const keyword = filters.keyword.trim()
  if (keyword !== '') {
    query.keyword = keyword
  }
  if (filters.dateFrom !== '') {
    query.from = filters.dateFrom
  }
  if (filters.dateTo !== '') {
    query.to = filters.dateTo
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

/* -------------------------------- 详情 -------------------------------- */

/** 详情字段行 */
export interface TransactionDetailRow {
  key: string
  label: string
  /** money 行为 DecimalString 原值（渲染层用 MoneyText 格式化） */
  value: string
  kind: 'text' | 'date' | 'money' | 'docNo' | 'status'
  tone?: 'success' | 'muted'
}

/** 可撤销的来源业务单据（撤销 = 原单据标记撤销 + 反向流水） */
export interface VoidableSourceDoc {
  sourceDocType: 'CONTRIBUTION' | 'EXPENSE' | 'TRANSFER'
  sourceDocId: string
  /** 单据类型展示名 */
  label: string
}

/** 交易详情结构 */
export interface TransactionDetailModel {
  rows: TransactionDetailRow[]
  /** 来源单据展示文本 */
  sourceDocText: string
  /** 可撤销的来源单据；不可撤销（无来源/已撤销/非业务单据）为 null */
  voidable: VoidableSourceDoc | null
}

/** 来源单据展示文本（无来源单据 = 手工录入） */
export function sourceDocText(txn: FundTransaction): string {
  if (txn.sourceDocType === null) {
    return '手工录入（无来源单据）'
  }
  return `${sourceDocTypeLabel(txn.sourceDocType)}（标识 ${txn.sourceDocId ?? '—'}）`
}

/** 该流水的来源业务单据是否可发起撤销（已撤销/非业务单据不可） */
export function resolveVoidableSource(txn: FundTransaction): VoidableSourceDoc | null {
  if (
    txn.sourceDocId === null ||
    txn.status === 'VOIDED' ||
    (txn.sourceDocType !== 'CONTRIBUTION' &&
      txn.sourceDocType !== 'EXPENSE' &&
      txn.sourceDocType !== 'TRANSFER')
  ) {
    return null
  }
  return {
    sourceDocType: txn.sourceDocType,
    sourceDocId: txn.sourceDocId,
    label: sourceDocTypeLabel(txn.sourceDocType),
  }
}

/**
 * 构建交易详情模型：全部字段 + 来源单据 + 撤销信息。
 * null 字段统一显示 '—'（禁止空字符串/魔法值表达空）。
 */
export function buildTransactionDetailModel(
  txn: FundTransaction,
  accountName: string | null,
): TransactionDetailModel {
  const rows: TransactionDetailRow[] = [
    { key: 'transactionNo', label: '流水编号', value: txn.transactionNo, kind: 'docNo' },
    { key: 'transactionType', label: '业务类型', value: transactionTypeLabel(txn.transactionType), kind: 'text' },
    { key: 'tradeDate', label: '交易日期', value: txn.tradeDate, kind: 'date' },
    { key: 'account', label: '资金账户', value: accountName ?? txn.accountId, kind: 'text' },
    { key: 'counterparty', label: '交易对手', value: txn.counterparty ?? '—', kind: 'text' },
    { key: 'direction', label: '收付方向', value: directionLabel(txn.direction), kind: 'text' },
    { key: 'amount', label: '交易金额', value: txn.amount, kind: 'money' },
    { key: 'sourceDoc', label: '来源单据', value: sourceDocText(txn), kind: 'text' },
    { key: 'transferGroupId', label: '内部转账组', value: txn.transferGroupId ?? '—', kind: 'text' },
    {
      key: 'status',
      label: '流水状态',
      value: TRANSACTION_STATUS_LABELS[txn.status],
      kind: 'status',
      tone: TRANSACTION_STATUS_KINDS[txn.status],
    },
    // 撤销信息：已作废展示撤销时间；有效流水显示 '—'
    { key: 'voidedAt', label: '撤销时间', value: txn.voidedAt ?? '—', kind: 'date' },
    { key: 'createdAt', label: '创建时间', value: txn.createdAt, kind: 'date' },
    { key: 'remark', label: '备注', value: txn.remark ?? '—', kind: 'text' },
  ]
  return { rows, sourceDocText: sourceDocText(txn), voidable: resolveVoidableSource(txn) }
}
