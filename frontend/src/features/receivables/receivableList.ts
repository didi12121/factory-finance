/**
 * 应收列表查询组合（纯函数）—— Agent F（P02-F）。
 *
 * 职责：把 `usePrototypeStore` 派生的 `ReceivableView[]` 组合成页面所需的
 * 行投影、筛选结果与顶部指标聚合。**不复制、不重算任何财务派生值**：
 * 已收/未收/回款状态/逾期一律读取 store 派生的 `ReceivableSummary`，
 * 本模块只做筛选、投影与精确求和聚合（sumAmounts / compareAmounts）。
 *
 * 金额红线：全部金额为 DecimalString，聚合走 `domain/amounts.sumAmounts`
 * （BigInt 定点），比较走 `utils/decimal.compareAmounts`，禁止 Number/parseFloat。
 * 日期红线：逾期判定一律来自 store 派生结果（DEMO_TODAY 基准），本模块不读真实时间。
 */

import { compareAmounts, type DecimalString } from '@/utils/decimal'
import { sumAmounts } from '../prototype/domain/amounts'
import type {
  AccountingMonth,
  Customer,
  EntityId,
  LocalDate,
  ReceivableStatus,
  ReceivableView,
} from '../prototype/contracts'

/* ---------------------------------- 状态语义 ---------------------------------- */

/** 回款状态中文标签（逾期是独立属性，不在此映射内） */
export const STATUS_LABELS: Record<ReceivableStatus, string> = {
  UNPAID: '未回款',
  PARTIALLY_PAID: '部分回款',
  SETTLED: '已结清',
}

/** 回款状态 → FinancialStatus 语义色（逾期独立标识，禁止用 OVERDUE 覆盖状态） */
export function statusKind(status: ReceivableStatus): 'warning' | 'brand' | 'success' {
  switch (status) {
    case 'SETTLED':
      return 'success'
    case 'PARTIALLY_PAID':
      return 'brand'
    default:
      return 'warning'
  }
}

/* ---------------------------------- 筛选条件 ---------------------------------- */

/** 列表 Tab（全部/未回款/部分回款/已结清/已逾期；逾期独立筛选维度） */
export type ReceivableTab = 'all' | 'unpaid' | 'partial' | 'settled' | 'overdue'

/** 回款状态筛选（'ALL' = 不限） */
export type StatusFilter = 'ALL' | ReceivableStatus

/** 列表筛选条件（Tab 与筛选栏共享同一状态：Tab 是预设，筛选栏可组合） */
export interface ReceivableFilterCriteria {
  /** 回款状态：ALL 不限 */
  status: StatusFilter
  /** 仅看逾期（独立派生属性，可与回款状态组合） */
  overdueOnly: boolean
  /** 客户：null 不限 */
  customerId: EntityId | null
  /** 所属月份：null 不限 */
  accountingMonth: AccountingMonth | null
  /** 关键字（对账单编号 / 客户名称模糊匹配） */
  keyword: string
}

/** 初始筛选条件（全部不限） */
export const DEFAULT_CRITERIA: ReceivableFilterCriteria = {
  status: 'ALL',
  overdueOnly: false,
  customerId: null,
  accountingMonth: null,
  keyword: '',
}

/** Tab → 筛选条件预设（点击 Tab 即重置另一维度，保证 Tab 高亮与结果一致） */
export function criteriaForTab(tab: ReceivableTab): Pick<ReceivableFilterCriteria, 'status' | 'overdueOnly'> {
  switch (tab) {
    case 'unpaid':
      return { status: 'UNPAID', overdueOnly: false }
    case 'partial':
      return { status: 'PARTIALLY_PAID', overdueOnly: false }
    case 'settled':
      return { status: 'SETTLED', overdueOnly: false }
    case 'overdue':
      return { status: 'ALL', overdueOnly: true }
    default:
      return { status: 'ALL', overdueOnly: false }
  }
}

/**
 * 筛选条件 → 当前 Tab（组合状态的反推）：
 * - 仅逾期（状态不限）→ 'overdue'；
 * - 其余按回款状态映射（部分回款 + 逾期组合仍高亮 'partial'，逾期以筛选栏为准）。
 */
export function tabForCriteria(criteria: Pick<ReceivableFilterCriteria, 'status' | 'overdueOnly'>): ReceivableTab {
  if (criteria.overdueOnly && criteria.status === 'ALL') {
    return 'overdue'
  }
  switch (criteria.status) {
    case 'UNPAID':
      return 'unpaid'
    case 'PARTIALLY_PAID':
      return 'partial'
    case 'SETTLED':
      return 'settled'
    default:
      return 'all'
  }
}

/* ---------------------------------- 筛选与行投影 ---------------------------------- */

/** 表格行投影（实体 + 派生统计的展示字段，金额一律原样取自 store 派生值） */
export interface ReceivableRow {
  id: EntityId
  statementNo: string
  customerId: EntityId
  customerName: string
  accountingMonth: AccountingMonth
  statementDate: LocalDate
  dueDate: LocalDate | null
  originalAmount: DecimalString
  paidAmount: DecimalString
  outstandingAmount: DecimalString
  status: ReceivableStatus
  isOverdue: boolean
}

/** 客户名称查找（缺失客户显示内部 ID，不伪造名称） */
function customerNameOf(customers: Customer[], customerId: EntityId): string {
  const found = customers.find((item) => item.id === customerId)
  return found === undefined ? customerId : found.name
}

/** 关键字匹配：对账单编号 / 客户名称（忽略大小写模糊匹配） */
function matchesKeyword(keyword: string, statementNo: string, customerName: string): boolean {
  const needle = keyword.trim().toLowerCase()
  if (needle === '') {
    return true
  }
  return statementNo.toLowerCase().includes(needle) || customerName.toLowerCase().includes(needle)
}

/**
 * 按筛选条件过滤应收组合视图（保持输入顺序，默认顺序由 store 给出：
 * 对账日期倒序 → id 倒序）。逾期筛选直接使用派生 isOverdue，禁止页面自算。
 */
export function filterReceivableViews(
  views: ReceivableView[],
  customers: Customer[],
  criteria: ReceivableFilterCriteria,
): ReceivableView[] {
  return views.filter((view) => {
    const customerName = customerNameOf(customers, view.receivable.customerId)
    return (
      (criteria.status === 'ALL' || view.summary.status === criteria.status) &&
      (!criteria.overdueOnly || view.summary.isOverdue) &&
      (criteria.customerId === null || view.receivable.customerId === criteria.customerId) &&
      (criteria.accountingMonth === null || view.receivable.accountingMonth === criteria.accountingMonth) &&
      matchesKeyword(criteria.keyword, view.receivable.statementNo, customerName)
    )
  })
}

/** 应收组合视图 → 表格行投影 */
export function toReceivableRows(views: ReceivableView[], customers: Customer[]): ReceivableRow[] {
  return views.map((view) => ({
    id: view.receivable.id,
    statementNo: view.receivable.statementNo,
    customerId: view.receivable.customerId,
    customerName: customerNameOf(customers, view.receivable.customerId),
    accountingMonth: view.receivable.accountingMonth,
    statementDate: view.receivable.statementDate,
    dueDate: view.receivable.dueDate,
    originalAmount: view.receivable.originalAmount,
    paidAmount: view.summary.paidAmount,
    outstandingAmount: view.summary.outstandingAmount,
    status: view.summary.status,
    isOverdue: view.summary.isOverdue,
  }))
}

/** 可选所属月份（降序，取数据中出现过的月份） */
export function distinctAccountingMonths(views: ReceivableView[]): AccountingMonth[] {
  return [...new Set(views.map((view) => view.receivable.accountingMonth))].sort().reverse()
}

/* ---------------------------------- 顶部指标聚合 ---------------------------------- */

/** 顶部财务指标（全部为 DecimalString；Σ 聚合，禁止 Number） */
export interface ReceivableMetrics {
  /** 累计应收金额 = Σ 原始应收金额 */
  totalOriginalAmount: DecimalString
  /** 累计已核销金额 = Σ 有效核销（summary.paidAmount） */
  totalPaidAmount: DecimalString
  /** 未收余额 = Σ summary.outstandingAmount（store 派生，不自算副本） */
  totalOutstandingAmount: DecimalString
  /** 逾期未收余额 = Σ 逾期单据的 summary.outstandingAmount */
  overdueOutstandingAmount: DecimalString
}

/**
 * 应收指标聚合（统计范围：全部应收单，不受列表筛选影响）。
 * 未收/逾期金额一律聚合 store 派生的 ReceivableSummary，禁止「原始 − 已收」自算副本。
 */
export function computeReceivableMetrics(views: ReceivableView[]): ReceivableMetrics {
  return {
    totalOriginalAmount: sumAmounts(views.map((view) => view.receivable.originalAmount)),
    totalPaidAmount: sumAmounts(views.map((view) => view.summary.paidAmount)),
    totalOutstandingAmount: sumAmounts(views.map((view) => view.summary.outstandingAmount)),
    overdueOutstandingAmount: sumAmounts(
      views.filter((view) => view.summary.isOverdue).map((view) => view.summary.outstandingAmount),
    ),
  }
}

/* ---------------------------------- 排序比较器（TanStack sortingFn） ---------------------------------- */

/**
 * 金额排序精确比较（compareAmounts，BigInt 定点）。
 * 供 TanStack `sortingFn: (a, b, id) => compareRowAmounts(...)` 使用。
 */
export function compareRowAmounts(a: DecimalString, b: DecimalString): number {
  return compareAmounts(a, b)
}

/** 回款状态语义排序：未回款 → 部分回款 → 已结清 */
const STATUS_ORDER: Record<ReceivableStatus, number> = {
  UNPAID: 0,
  PARTIALLY_PAID: 1,
  SETTLED: 2,
}

export function compareRowStatus(a: ReceivableStatus, b: ReceivableStatus): number {
  return STATUS_ORDER[a] - STATUS_ORDER[b]
}

/** 到期日排序：未约定到期日（null）恒排最后，其余按日期字典序 */
export function compareRowDueDate(a: LocalDate | null, b: LocalDate | null): number {
  if (a === null && b === null) {
    return 0
  }
  if (a === null) {
    return 1
  }
  if (b === null) {
    return -1
  }
  return a < b ? -1 : a > b ? 1 : 0
}
