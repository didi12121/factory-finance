/**
 * 演示数据不变量测试：规模覆盖、编号唯一、金额恒正、核销一致性、
 * 内部转账成对、跨模块验证场景初始状态。
 */

import { describe, expect, it } from 'vitest'
import { compareAmounts } from '@/utils/decimal'
import { isValidAmount } from '@/utils/money'
import {
  DEMO_CUSTOMERS,
  DEMO_FUND_ACCOUNTS,
  DEMO_FUND_TRANSACTIONS,
  DEMO_RECEIVABLES,
  DEMO_RECEIPT_ALLOCATIONS,
  DEMO_RECEIPTS,
  createInitialPrototypeState,
} from '../data/fixtures'
import { sumAmounts } from '../domain/amounts'
import { deriveReceivableSummary } from '../domain/receivable'
import { netCashChange } from '../domain/treasury'

describe('演示数据 fixtures', () => {
  it('规模覆盖：客户 ≥ 4、账户 ≥ 3、应收 > 一页（24 张）、跨 3 个会计期间', () => {
    expect(DEMO_CUSTOMERS.length).toBe(5)
    expect(DEMO_FUND_ACCOUNTS.length).toBe(4)
    expect(DEMO_RECEIVABLES.length).toBe(24)
    expect(DEMO_RECEIVABLES.length).toBeGreaterThan(23)
    const months = new Set(DEMO_RECEIVABLES.map((item) => item.accountingMonth))
    expect([...months].sort()).toEqual(['2026-09', '2026-10', '2026-11'])
  })

  it('编号与内部 ID 全局唯一', () => {
    const ids = [
      ...DEMO_CUSTOMERS.map((item) => item.id),
      ...DEMO_FUND_ACCOUNTS.map((item) => item.id),
      ...DEMO_RECEIVABLES.map((item) => item.id),
      ...DEMO_RECEIPTS.map((item) => item.id),
      ...DEMO_RECEIPT_ALLOCATIONS.map((item) => item.id),
      ...DEMO_FUND_TRANSACTIONS.map((item) => item.id),
    ]
    expect(new Set(ids).size).toBe(ids.length)

    const numbers = [
      ...DEMO_RECEIVABLES.map((item) => item.statementNo),
      ...DEMO_RECEIPTS.map((item) => item.receiptNo),
      ...DEMO_FUND_TRANSACTIONS.map((item) => item.transactionNo),
    ]
    expect(new Set(numbers).size).toBe(numbers.length)
  })

  it('全部金额为合法 DECIMAL(18,2) 且单条流水金额恒正', () => {
    const amounts = [
      ...DEMO_FUND_ACCOUNTS.map((item) => item.openingBalance),
      ...DEMO_RECEIVABLES.map((item) => item.originalAmount),
      ...DEMO_RECEIPTS.map((item) => item.actualAmount),
      ...DEMO_RECEIPT_ALLOCATIONS.map((item) => item.allocationAmount),
      ...DEMO_FUND_TRANSACTIONS.map((item) => item.amount),
    ]
    for (const amount of amounts) {
      expect(isValidAmount(amount)).toBe(true)
    }
    for (const txn of DEMO_FUND_TRANSACTIONS) {
      expect(compareAmounts(txn.amount, '0')).toBeGreaterThan(0)
    }
  })

  it('收款单与资金流入一一对应，且全部核销完毕（Σ核销 = 实收）', () => {
    expect(DEMO_RECEIPTS.length).toBe(8)
    for (const receipt of DEMO_RECEIPTS) {
      const txn = DEMO_FUND_TRANSACTIONS.find((item) => item.id === receipt.fundTransactionId)
      expect(txn).toBeDefined()
      expect(txn?.direction).toBe('IN')
      expect(txn?.amount).toBe(receipt.actualAmount)
      expect(txn?.sourceDocType).toBe('RECEIPT')
      expect(txn?.sourceDocId).toBe(receipt.id)
      const allocated = sumAmounts(
        DEMO_RECEIPT_ALLOCATIONS
          .filter((item) => item.receiptId === receipt.id)
          .map((item) => item.allocationAmount),
      )
      expect(allocated).toBe(receipt.actualAmount)
    }
  })

  it('单张应收累计核销不超原始金额；总额与手算一致（原始 449,614.38 / 已收 47,046.51 / 未收 402,567.87）', () => {
    for (const receivable of DEMO_RECEIVABLES) {
      const paid = sumAmounts(
        DEMO_RECEIPT_ALLOCATIONS
          .filter((item) => item.receivableId === receivable.id)
          .map((item) => item.allocationAmount),
      )
      expect(compareAmounts(paid, receivable.originalAmount)).toBeLessThanOrEqual(0)
    }
    const totalOriginal = sumAmounts(DEMO_RECEIVABLES.map((item) => item.originalAmount))
    const totalPaid = sumAmounts(DEMO_RECEIPT_ALLOCATIONS.map((item) => item.allocationAmount))
    expect(totalOriginal).toBe('449614.38')
    expect(totalPaid).toBe('47046.51')
    expect(sumAmounts(DEMO_RECEIPTS.map((item) => item.actualAmount))).toBe('47046.51')
  })

  it('内部转账成对流水：2 组、同额、反向、净变化为 0', () => {
    const transfers = DEMO_FUND_TRANSACTIONS.filter((item) => item.transferGroupId !== null)
    expect(transfers.length).toBe(4)
    const groups = new Set(transfers.map((item) => item.transferGroupId))
    expect(groups.size).toBe(2)
    for (const groupId of groups) {
      const pair = transfers.filter((item) => item.transferGroupId === groupId)
      expect(pair.length).toBe(2)
      expect(pair[0]?.amount).toBe(pair[1]?.amount)
      expect(pair[0]?.direction).not.toBe(pair[1]?.direction)
      expect(netCashChange(pair)).toBe('0.00')
    }
  })

  it('状态/逾期/金额覆盖：UNPAID、PARTIALLY_PAID、SETTLED、逾期、未到期、0.01 级、大金额', () => {
    const summaries = DEMO_RECEIVABLES.map((item) => deriveReceivableSummary(item, DEMO_RECEIPT_ALLOCATIONS))
    const statuses = new Set(summaries.map((item) => item.status))
    expect(statuses).toEqual(new Set(['UNPAID', 'PARTIALLY_PAID', 'SETTLED']))

    const overdueItems = summaries.filter((item) => item.isOverdue)
    expect(overdueItems.length).toBe(6)
    expect(sumAmounts(overdueItems.map((item) => item.outstandingAmount))).toBe('40800.01')

    // 未到期：dueDate ≥ DEMO_TODAY 或空（ar-005 到期日当天不算逾期、ar-011 无到期日不判逾期）
    const ar005 = DEMO_RECEIVABLES.find((item) => item.id === 'ar-005')
    expect(ar005).toBeDefined()
    expect(deriveReceivableSummary(ar005!, DEMO_RECEIPT_ALLOCATIONS).isOverdue).toBe(false)
    const ar011 = DEMO_RECEIVABLES.find((item) => item.id === 'ar-011')
    expect(deriveReceivableSummary(ar011!, DEMO_RECEIPT_ALLOCATIONS).isOverdue).toBe(false)

    // 0.01 级与大金额样例
    expect(DEMO_RECEIVABLES.find((item) => item.id === 'ar-010')?.originalAmount).toBe('0.01')
    expect(DEMO_RECEIVABLES.find((item) => item.id === 'ar-011')?.originalAmount).toBe('250000.00')
    const ar020 = DEMO_RECEIVABLES.find((item) => item.id === 'ar-020')
    expect(deriveReceivableSummary(ar020!, DEMO_RECEIPT_ALLOCATIONS).outstandingAmount).toBe('0.01')
  })

  it('跨模块验证场景初始状态：示例客户 A 应收单 A=8,000.00、应收单 B=12,000.00 均未回款且无核销', () => {
    const arA = DEMO_RECEIVABLES.find((item) => item.id === 'ar-001')
    const arB = DEMO_RECEIVABLES.find((item) => item.id === 'ar-002')
    expect(arA?.customerId).toBe('cust-a')
    expect(arA?.originalAmount).toBe('8000.00')
    expect(arB?.customerId).toBe('cust-a')
    expect(arB?.originalAmount).toBe('12000.00')
    for (const receivable of [arA!, arB!]) {
      const summary = deriveReceivableSummary(receivable, DEMO_RECEIPT_ALLOCATIONS)
      expect(summary.status).toBe('UNPAID')
      expect(summary.paidAmount).toBe('0.00')
      expect(summary.outstandingAmount).toBe(receivable.originalAmount)
    }
    const scenarioAllocations = DEMO_RECEIPT_ALLOCATIONS.filter(
      (item) => item.receivableId === 'ar-001' || item.receivableId === 'ar-002',
    )
    expect(scenarioAllocations.length).toBe(0)
  })

  it('createInitialPrototypeState 每次返回独立副本（页面刷新恢复初始状态）', () => {
    const first = createInitialPrototypeState()
    const second = createInitialPrototypeState()
    expect(first.receivables.length).toBe(24)
    first.receivables.pop()
    first.receipts.push({
      id: 'rc-mutated',
      receiptNo: 'SK-2026-9999',
      customerId: 'cust-a',
      receiptDate: '2026-11-30',
      accountId: 'acct-bank',
      actualAmount: '1.00',
      fundTransactionId: 'txn-mutated',
      externalRef: null,
      remark: null,
      idempotencyKey: 'mutated',
    })
    expect(second.receivables.length).toBe(24)
    expect(second.receipts.length).toBe(8)
    expect(second.idempotencyRecords).toEqual({})
  })
})
