/**
 * 应收派生规则（纯函数）：已收/未收/回款状态/逾期。
 *
 * 红线：
 * - 已收金额 = Σ 该应收单的核销明细金额（addAmounts 精确累加）；
 * - 未收金额 = 原始应收 − 已收（subtractAmounts），恒 ≥ 0；
 * - 回款状态由核销明细派生（UNPAID / PARTIALLY_PAID / SETTLED），逾期为独立派生属性
 *   （dueDate 非空 且 dueDate < asOf 且未收清），禁止用 OVERDUE 替代回款状态；
 * - asOf 默认 DEMO_TODAY，禁止使用真实当前时间。
 */

import { compareAmounts, subtractAmounts } from '@/utils/decimal'
import {
  DEMO_TODAY,
  type LocalDate,
  type Receivable,
  type ReceivableStatus,
  type ReceivableSummary,
  type ReceivableView,
  type ReceiptAllocation,
} from '../contracts'
import { canonicalAmount2, sumAmounts } from './amounts'

/**
 * 派生单张应收的统计（asOf 默认 DEMO_TODAY）。
 * allocations 传入全部核销明细即可，函数内部只取 receivableId 匹配的明细。
 */
export function deriveReceivableSummary(
  receivable: Receivable,
  allocations: ReceiptAllocation[],
  asOf: LocalDate = DEMO_TODAY,
): ReceivableSummary {
  const own = allocations.filter((item) => item.receivableId === receivable.id)
  const paidAmount = canonicalAmount2(sumAmounts(own.map((item) => item.allocationAmount)))

  const rawOutstanding = subtractAmounts(receivable.originalAmount, paidAmount)
  const outstandingAmount =
    compareAmounts(rawOutstanding, '0') < 0 ? '0.00' : canonicalAmount2(rawOutstanding)

  const status: ReceivableStatus =
    compareAmounts(paidAmount, receivable.originalAmount) >= 0
      ? 'SETTLED'
      : compareAmounts(paidAmount, '0') > 0
        ? 'PARTIALLY_PAID'
        : 'UNPAID'

  // 逾期是独立派生属性：dueDate 为 null 恒为 false；到期日当天（dueDate === asOf）不算逾期
  const isOverdue =
    receivable.dueDate !== null &&
    receivable.dueDate < asOf &&
    compareAmounts(outstandingAmount, '0') > 0

  return { paidAmount, outstandingAmount, status, isOverdue, asOf }
}

/** 应收组合视图（实体 + 派生统计） */
export function buildReceivableView(
  receivable: Receivable,
  allocations: ReceiptAllocation[],
  asOf: LocalDate = DEMO_TODAY,
): ReceivableView {
  return { receivable, summary: deriveReceivableSummary(receivable, allocations, asOf) }
}

/** 批量构建应收组合视图 */
export function buildReceivableViews(
  receivables: Receivable[],
  allocations: ReceiptAllocation[],
  asOf: LocalDate = DEMO_TODAY,
): ReceivableView[] {
  return receivables.map((receivable) => buildReceivableView(receivable, allocations, asOf))
}

/**
 * 应收紧迫度稳定排序：dueDate 较早 → statementDate 较早 → id 升序；
 * 无 dueDate 的应收排在有 dueDate 的应收之后（内部再按 statementDate → id）。
 * 用于自动核销建议顺序与「待收单据」展示顺序。
 */
export function compareReceivableUrgency(a: Receivable, b: Receivable): number {
  if (a.dueDate !== null && b.dueDate !== null) {
    if (a.dueDate !== b.dueDate) {
      return a.dueDate < b.dueDate ? -1 : 1
    }
  } else if (a.dueDate !== null) {
    return -1
  } else if (b.dueDate !== null) {
    return 1
  }
  if (a.statementDate !== b.statementDate) {
    return a.statementDate < b.statementDate ? -1 : 1
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}
