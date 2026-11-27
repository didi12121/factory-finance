/**
 * 看板统计测试：收入≠回款、股东出资不计收入、内部转账不计外部收付、
 * 余额不因期间筛选变化、日期区间过滤、0.01 级精确汇总。
 */

import { describe, expect, it } from 'vitest'
import type { DashboardPeriod } from '../contracts'
import { createInitialPrototypeState } from '../data/fixtures'
import { sumAmounts } from '../domain/amounts'
import { computeDashboardSummary, type DashboardSourceState } from '../domain/reporting'

const NOV: DashboardPeriod = { from: '2026-11-01', to: '2026-11-30' }
const SEP: DashboardPeriod = { from: '2026-09-01', to: '2026-09-30' }
const OCT: DashboardPeriod = { from: '2026-10-01', to: '2026-10-31' }
const ALL: DashboardPeriod = { from: '2026-09-01', to: '2026-11-30' }

function sourceState(): DashboardSourceState {
  const state = createInitialPrototypeState()
  return {
    fundAccounts: state.fundAccounts,
    fundTransactions: state.fundTransactions,
    receivables: state.receivables,
    receipts: state.receipts,
    receiptAllocations: state.receiptAllocations,
  }
}

describe('computeDashboardSummary', () => {
  it('2026-11 期间：加工收入 99,278.32 ≠ 实际回款 37,246.01；实际支出 43,150.50', () => {
    const summary = computeDashboardSummary(sourceState(), NOV)
    expect(summary.asOf).toBe('2026-11-30')
    expect(summary.period).toEqual(NOV)
    expect(summary.periodProcessingFeeIncome).toBe('99278.32')
    expect(summary.periodActualReceipts).toBe('37246.01')
    expect(summary.periodActualExpenses).toBe('43150.50')
  })

  it('当前余额类指标不因期间筛选变化：资金 77,661.45 / 应收 402,567.87 / 逾期 40,800.01', () => {
    const nov = computeDashboardSummary(sourceState(), NOV)
    const sep = computeDashboardSummary(sourceState(), SEP)
    const all = computeDashboardSummary(sourceState(), ALL)
    expect(nov.totalFundBalance).toBe('77661.45')
    expect(sep.totalFundBalance).toBe('77661.45')
    expect(all.totalFundBalance).toBe('77661.45')
    expect(nov.totalReceivableOutstanding).toBe('402567.87')
    expect(nov.overdueReceivableOutstanding).toBe('40800.01')
  })

  it('股东出资不增加收入：2026-09 加工收入 59,534.90（50,000.00 出资不计入），趋势含 9-1 流入', () => {
    const summary = computeDashboardSummary(sourceState(), SEP)
    expect(summary.periodProcessingFeeIncome).toBe('59534.90')
    expect(summary.periodProcessingFeeIncome).not.toBe('109534.90')
    expect(summary.periodActualReceipts).toBe('0.00')
    expect(summary.periodActualExpenses).toBe('73000.00')

    const firstDay = summary.cashFlowTrend.find((point) => point.date === '2026-09-01')
    expect(firstDay?.inflow).toBe('50000.00')
    expect(firstDay?.outflow).toBe('0.00')
  })

  it('内部转账不计入外部收付趋势与实际支出（10-12 / 11-20 无趋势点）', () => {
    const oct = computeDashboardSummary(sourceState(), OCT)
    expect(oct.cashFlowTrend.some((point) => point.date === '2026-10-12')).toBe(false)
    expect(oct.periodActualExpenses).toBe('29234.56')

    const nov = computeDashboardSummary(sourceState(), NOV)
    expect(nov.cashFlowTrend.some((point) => point.date === '2026-11-20')).toBe(false)

    const all = computeDashboardSummary(sourceState(), ALL)
    // 有效外部支出 = 145,385.06（已排除内部转账 OUT 12,000.00 与作废流水 500.00）
    expect(all.periodActualExpenses).toBe('145385.06')
  })

  it('2026-11 资金收付趋势按日聚合：9 个点，流入 37,246.01 / 流出 43,150.50', () => {
    const summary = computeDashboardSummary(sourceState(), NOV)
    expect(summary.cashFlowTrend.length).toBe(9)
    expect(summary.cashFlowTrend.map((point) => point.date)).toEqual([
      '2026-11-05', '2026-11-08', '2026-11-10', '2026-11-12', '2026-11-15',
      '2026-11-18', '2026-11-22', '2026-11-26', '2026-11-30',
    ])
    expect(sumAmounts(summary.cashFlowTrend.map((point) => point.inflow))).toBe('37246.01')
    expect(sumAmounts(summary.cashFlowTrend.map((point) => point.outflow))).toBe('43150.50')
    const mixed = summary.cashFlowTrend.find((point) => point.date === '2026-11-08')
    expect(mixed?.inflow).toBe('3200.35')
    expect(mixed?.outflow).toBe('1350.00')
  })

  it('支出分类（2026-11）：SALARY 29,500.00 / UTILITIES 1,350.00 / PURCHASE 12,000.50 / OTHER 300.00', () => {
    const summary = computeDashboardSummary(sourceState(), NOV)
    expect(summary.expenseBreakdown).toEqual([
      { category: 'SALARY', amount: '29500.00' },
      { category: 'UTILITIES', amount: '1350.00' },
      { category: 'PURCHASE', amount: '12000.50' },
      { category: 'OTHER', amount: '300.00' },
    ])
    const oct = computeDashboardSummary(sourceState(), OCT)
    expect(oct.expenseBreakdown).toEqual([
      { category: 'SALARY', amount: '28000.00' },
      { category: 'UTILITIES', amount: '1234.56' },
    ])
  })

  it('近期流水按业务日期倒序取 10 条（不含作废流水），待收单据 18 张按紧迫度排序', () => {
    const summary = computeDashboardSummary(sourceState(), NOV)
    expect(summary.recentTransactions.length).toBe(10)
    expect(summary.recentTransactions.map((item) => item.id)).toEqual([
      'txn-022', 'txn-021', 'txn-019', 'txn-018', 'txn-017',
      'txn-016', 'txn-015', 'txn-014', 'txn-013', 'txn-012',
    ])
    expect(summary.recentTransactions.some((item) => item.status === 'VOIDED')).toBe(false)

    expect(summary.pendingReceivables.length).toBe(18)
    // 紧迫度：dueDate 升序（无到期日在后）
    expect(summary.pendingReceivables[0]?.receivable.id).toBe('ar-020')
    expect(summary.pendingReceivables[1]?.receivable.id).toBe('ar-010')
    const last = summary.pendingReceivables[summary.pendingReceivables.length - 1]
    expect(last?.receivable.id).toBe('ar-017')
  })

  it('全期间汇总可重算核对：收入 449,614.38 = 全部应收原始金额；回款 47,046.51 = 全部核销金额', () => {
    const state = sourceState()
    const summary = computeDashboardSummary(state, ALL)
    expect(summary.periodProcessingFeeIncome).toBe(
      sumAmounts(state.receivables.map((item) => item.originalAmount)),
    )
    expect(summary.periodProcessingFeeIncome).toBe('449614.38')
    expect(summary.periodActualReceipts).toBe('47046.51')
    expect(summary.cashFlowTrend.length).toBe(16)
  })

  it('会计期间归属整月计入：11 月中下旬区间仍计入 2026-11 全部应收（不按天摊分）', () => {
    const partial: DashboardPeriod = { from: '2026-11-15', to: '2026-11-30' }
    const summary = computeDashboardSummary(sourceState(), partial)
    expect(summary.periodProcessingFeeIncome).toBe('99278.32')
  })
})
