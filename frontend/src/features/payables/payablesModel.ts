/**
 * 应付/付款页面纯逻辑（无副作用，可独立测试）。
 *
 * 红线：
 * - 金额一律 DecimalString；汇总走 sumAmounts（BigInt 定点），比较走 compareAmounts；
 * - 已付/未付/状态读取后端派生值（payable.paidAmount / outstandingAmount / paymentStatus），
 *   页面不自算余额副本；
 * - 本阶段付款为全额核销：付款金额 = Σ 核销金额（页面据此派生，不手填）。
 */

import { compareAmounts, type DecimalString } from '@/utils/decimal'
import { sumAmounts } from '@/features/prototype/domain/amounts'
import { canonicalAmount2 } from '@/features/prototype/domain/amounts'
import type { PayablePaymentStatus, PayableRecord, PaymentRecord } from '@/services/api'

/** 付款状态标签 */
export const PAYMENT_STATUS_LABELS: Record<PayablePaymentStatus, string> = {
  UNPAID: '未付款',
  PARTIALLY_PAID: '部分付款',
  SETTLED: '已结清',
}

/** 付款状态 → 语义色 */
export function paymentStatusKind(status: PayablePaymentStatus): 'warning' | 'brand' | 'success' {
  switch (status) {
    case 'SETTLED':
      return 'success'
    case 'PARTIALLY_PAID':
      return 'brand'
    default:
      return 'warning'
  }
}

/** 应付合计指标（Σ 后端派生值，禁止 Number） */
export interface PayableMetrics {
  totalAmount: DecimalString
  totalPaid: DecimalString
  totalOutstanding: DecimalString
}

export function computePayableMetrics(rows: PayableRecord[]): PayableMetrics {
  const confirmed = rows.filter((row) => row.status === 'CONFIRMED')
  return {
    totalAmount: canonicalAmount2(sumAmounts(confirmed.map((row) => row.amount))),
    totalPaid: canonicalAmount2(sumAmounts(confirmed.map((row) => row.paidAmount))),
    totalOutstanding: canonicalAmount2(sumAmounts(confirmed.map((row) => row.outstandingAmount))),
  }
}

/** 某供应商的可付款应付单（未结清且非支出单直接支付） */
export function openPayablesOf(rows: PayableRecord[], supplierId: string): PayableRecord[] {
  return rows
    .filter((row) => row.status === 'CONFIRMED' && row.supplierId === supplierId)
    .filter((row) => row.fundedExpenseId === null)
    .filter((row) => compareAmounts(row.outstandingAmount, '0') > 0)
    .slice()
    .sort((a, b) => {
      if (a.dueDate === null && b.dueDate === null) {
        return a.bizDate < b.bizDate ? -1 : a.bizDate > b.bizDate ? 1 : 0
      }
      if (a.dueDate === null) {
        return 1
      }
      if (b.dueDate === null) {
        return -1
      }
      return a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0
    })
}

/** 付款单核销明细合计（付款单已分配金额） */
export function paymentAllocatedTotal(payment: PaymentRecord): DecimalString {
  return canonicalAmount2(
    sumAmounts(
      payment.allocations
        .filter((allocation) => allocation.status === 'ACTIVE')
        .map((allocation) => allocation.allocationAmount),
    ),
  )
}
