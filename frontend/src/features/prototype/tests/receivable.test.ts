/**
 * 应收派生规则测试：已收/未收/状态/逾期派生、精确金额加减、紧迫度排序。
 */

import { describe, expect, it } from 'vitest'
import { DEMO_TODAY, type Receivable, type ReceiptAllocation } from '../contracts'
import {
  buildReceivableViews,
  compareReceivableUrgency,
  deriveReceivableSummary,
} from '../domain/receivable'
import { allocationOf } from './helpers'

function makeReceivable(overrides: Partial<Receivable> = {}): Receivable {
  return {
    id: 'ar-test',
    statementNo: 'AR-TEST-0001',
    customerId: 'cust-x',
    accountingMonth: '2026-11',
    statementDate: '2026-11-01',
    dueDate: null,
    originalAmount: '100.00',
    remark: null,
    createdAt: '2026-11-01T09:00:00',
    ...overrides,
  }
}

function makeAllocation(receivableId: string, allocationAmount: string): ReceiptAllocation {
  return allocationOf('rc-test', receivableId, allocationAmount)
}

describe('deriveReceivableSummary', () => {
  it('未回款：已收 0.00、未收 = 原始金额、状态 UNPAID', () => {
    const receivable = makeReceivable({ originalAmount: '8000.00' })
    const summary = deriveReceivableSummary(receivable, [])
    expect(summary.paidAmount).toBe('0.00')
    expect(summary.outstandingAmount).toBe('8000.00')
    expect(summary.status).toBe('UNPAID')
    expect(summary.isOverdue).toBe(false)
    expect(summary.asOf).toBe(DEMO_TODAY)
  })

  it('部分回款：0 < 已收 < 原始 → PARTIALLY_PAID', () => {
    const receivable = makeReceivable({ originalAmount: '12000.00' })
    const summary = deriveReceivableSummary(receivable, [
      makeAllocation(receivable.id, '7000.00'),
    ])
    expect(summary.paidAmount).toBe('7000.00')
    expect(summary.outstandingAmount).toBe('5000.00')
    expect(summary.status).toBe('PARTIALLY_PAID')
  })

  it('全额核销：已收 = 原始 → SETTLED（多笔核销累加）', () => {
    const receivable = makeReceivable({ originalAmount: '6500.00' })
    const summary = deriveReceivableSummary(receivable, [
      makeAllocation(receivable.id, '6499.99'),
      makeAllocation(receivable.id, '0.01'),
    ])
    expect(summary.paidAmount).toBe('6500.00')
    expect(summary.outstandingAmount).toBe('0.00')
    expect(summary.status).toBe('SETTLED')
  })

  it('精确金额加减：0.01 级拆分求和无浮点误差（1850.39 = 0.01 + 1850.38；0.10+0.20=0.30）', () => {
    const receivable = makeReceivable({ originalAmount: '1850.39' })
    const summary = deriveReceivableSummary(receivable, [
      makeAllocation(receivable.id, '0.01'),
      makeAllocation(receivable.id, '1850.38'),
    ])
    expect(summary.paidAmount).toBe('1850.39')
    expect(summary.outstandingAmount).toBe('0.00')
    expect(summary.status).toBe('SETTLED')

    const tiny = makeReceivable({ id: 'ar-tiny', originalAmount: '0.30' })
    const tinySummary = deriveReceivableSummary(tiny, [
      makeAllocation(tiny.id, '0.10'),
      makeAllocation(tiny.id, '0.20'),
    ])
    expect(tinySummary.paidAmount).toBe('0.30')
    expect(tinySummary.outstandingAmount).toBe('0.00')
    expect(tinySummary.status).toBe('SETTLED')
  })

  it('逾期为独立派生属性：dueDate < asOf 且未收清；到期日当天/无到期日/已结清均不逾期', () => {
    const overdueUnpaid = makeReceivable({ id: 'a1', dueDate: '2026-11-29', originalAmount: '10.00' })
    expect(deriveReceivableSummary(overdueUnpaid, []).isOverdue).toBe(true)

    const dueToday = makeReceivable({ id: 'a2', dueDate: '2026-11-30', originalAmount: '10.00' })
    expect(deriveReceivableSummary(dueToday, []).isOverdue).toBe(false)

    const noDueDate = makeReceivable({ id: 'a3', dueDate: null, originalAmount: '10.00' })
    expect(deriveReceivableSummary(noDueDate, []).isOverdue).toBe(false)

    const settledPastDue = makeReceivable({ id: 'a4', dueDate: '2026-10-01', originalAmount: '10.00' })
    const settled = deriveReceivableSummary(settledPastDue, [
      makeAllocation(settledPastDue.id, '10.00'),
    ])
    expect(settled.status).toBe('SETTLED')
    expect(settled.isOverdue).toBe(false)

    // 部分回款与逾期并存
    const partialOverdue = makeReceivable({ id: 'a5', dueDate: '2026-11-01', originalAmount: '20000.00' })
    const partial = deriveReceivableSummary(partialOverdue, [
      makeAllocation(partialOverdue.id, '12000.00'),
    ])
    expect(partial.status).toBe('PARTIALLY_PAID')
    expect(partial.isOverdue).toBe(true)
    expect(partial.outstandingAmount).toBe('8000.00')
  })

  it('asOf 基准可指定；只统计本应收单的核销明细', () => {
    const receivable = makeReceivable({ id: 'a6', dueDate: '2026-11-20', originalAmount: '100.00' })
    const foreign = makeAllocation('other-ar', '999.99')
    const summary = deriveReceivableSummary(receivable, [foreign], '2026-11-25')
    expect(summary.paidAmount).toBe('0.00')
    expect(summary.isOverdue).toBe(true)
  })
})

describe('compareReceivableUrgency / buildReceivableViews', () => {
  it('排序：dueDate 较早 → statementDate 较早 → id；无 dueDate 排在有 dueDate 之后', () => {
    const items: Receivable[] = [
      makeReceivable({ id: 'r-null-2', dueDate: null, statementDate: '2026-11-02', originalAmount: '1' }),
      makeReceivable({ id: 'r-b', dueDate: '2026-12-20', statementDate: '2026-11-01', originalAmount: '1' }),
      makeReceivable({ id: 'r-a', dueDate: '2026-12-15', statementDate: '2026-11-01', originalAmount: '1' }),
      makeReceivable({ id: 'r-null-1', dueDate: null, statementDate: '2026-11-01', originalAmount: '1' }),
      makeReceivable({ id: 'r-tie-2', dueDate: '2026-12-15', statementDate: '2026-11-01', originalAmount: '1' }),
      makeReceivable({ id: 'r-early-stmt', dueDate: '2026-12-15', statementDate: '2026-10-01', originalAmount: '1' }),
    ]
    const sorted = [...items].sort(compareReceivableUrgency).map((item) => item.id)
    expect(sorted).toEqual([
      'r-early-stmt', // due 12-15 + statementDate 10-01 最早
      'r-a', // due 12-15 + 11-01 + id 'r-a'
      'r-tie-2', // due 12-15 + 11-01 + id 'r-tie-2'
      'r-b', // due 12-20
      'r-null-1', // 无 dueDate，statementDate 11-01
      'r-null-2', // 无 dueDate，statementDate 11-02
    ])
  })

  it('buildReceivableViews 组合实体与派生统计', () => {
    const receivable = makeReceivable({ originalAmount: '5000.00' })
    const views = buildReceivableViews([receivable], [makeAllocation(receivable.id, '2000.00')])
    expect(views.length).toBe(1)
    expect(views[0]?.receivable.id).toBe('ar-test')
    expect(views[0]?.summary.paidAmount).toBe('2000.00')
    expect(views[0]?.summary.outstandingAmount).toBe('3000.00')
    expect(views[0]?.summary.status).toBe('PARTIALLY_PAID')
  })
})
