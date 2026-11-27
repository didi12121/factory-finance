/**
 * 经营概览取数管线（唯一数据源 usePrototypeStore → getDashboardSummary）。
 *
 * 断言（DashboardSummary 契约口径 + 财务红线）：
 * - 余额口径：当前资金余额/当前应收余额为「当前余额」，不因期间筛选变成期间发生额；
 * - 期间发生额：加工收入/实际回款/实际支出随日期筛选真实改变；
 * - 业务与财务分离：加工收入(权责) ≠ 实际回款(资金)；股东出资不计收入；内部转账不计收付趋势。
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import type { DashboardPeriod } from '@/features/prototype/contracts'
import { usePrototypeStore } from '@/features/prototype/stores/prototype'

const NOV: DashboardPeriod = { from: '2026-11-01', to: '2026-11-30' }
const OCT: DashboardPeriod = { from: '2026-10-01', to: '2026-10-31' }
const SEP: DashboardPeriod = { from: '2026-09-01', to: '2026-09-30' }

type Store = ReturnType<typeof usePrototypeStore>

function setup(): Store {
  setActivePinia(createPinia())
  return usePrototypeStore()
}

describe('经营概览取数（经 Store）', () => {
  let store: Store
  beforeEach(() => {
    store = setup()
  })

  it('余额口径：当前资金余额 77,661.45 / 当前应收余额 402,567.87 不因期间筛选变化', async () => {
    const nov = await store.getDashboardSummary(NOV)
    const oct = await store.getDashboardSummary(OCT)
    const sep = await store.getDashboardSummary(SEP)

    for (const summary of [nov, oct, sep]) {
      expect(summary.totalFundBalance).toBe('77661.45')
      expect(summary.totalReceivableOutstanding).toBe('402567.87')
    }
    // 余额（当前）与期间发生额是不同口径
    expect(nov.totalFundBalance).not.toBe(nov.periodProcessingFeeIncome)
  })

  it('期间发生额（2026-11）：加工收入 99,278.32 / 实际回款 37,246.01 / 实际支出 43,150.50', async () => {
    const nov = await store.getDashboardSummary(NOV)
    expect(nov.periodProcessingFeeIncome).toBe('99278.32')
    expect(nov.periodActualReceipts).toBe('37246.01')
    expect(nov.periodActualExpenses).toBe('43150.50')
    // 回款 ≠ 收入（业务与财务分离）
    expect(nov.periodActualReceipts).not.toBe(nov.periodProcessingFeeIncome)
  })

  it('日期筛选真实改变期间发生额：上月(2026-10) 与本月(2026-11) 数值不同', async () => {
    const nov = await store.getDashboardSummary(NOV)
    const oct = await store.getDashboardSummary(OCT)

    expect(oct.periodProcessingFeeIncome).toBe('290801.16')
    expect(oct.periodActualReceipts).toBe('9800.50')
    expect(oct.periodActualExpenses).toBe('29234.56')

    expect(oct.periodProcessingFeeIncome).not.toBe(nov.periodProcessingFeeIncome)
    expect(oct.periodActualReceipts).not.toBe(nov.periodActualReceipts)
    expect(oct.periodActualExpenses).not.toBe(nov.periodActualExpenses)
  })

  it('股东出资不计收入：2026-09 加工收入 59,534.90（50,000.00 出资不计入）', async () => {
    const sep = await store.getDashboardSummary(SEP)
    expect(sep.periodProcessingFeeIncome).toBe('59534.90')
    expect(sep.periodProcessingFeeIncome).not.toBe('109534.90')
  })

  it('内部转账不计收付趋势：本月趋势不含内部转账日 2026-11-20', async () => {
    const nov = await store.getDashboardSummary(NOV)
    const dates = nov.cashFlowTrend.map((point) => point.date)
    expect(dates).not.toContain('2026-11-20')
    // 其余有实际收付的日期存在
    expect(dates).toContain('2026-11-08')
  })

  it('趋势数据（本月）：按日 IN/OUT 聚合，2026-11-08 流入 3,200.35 / 流出 1,350.00', async () => {
    const nov = await store.getDashboardSummary(NOV)
    const point = nov.cashFlowTrend.find((p) => p.date === '2026-11-08')
    expect(point?.inflow).toBe('3200.35')
    expect(point?.outflow).toBe('1350.00')
  })

  it('支出分类数据（本月）：SALARY/UTILITIES/PURCHASE/OTHER 固定顺序与金额', async () => {
    const nov = await store.getDashboardSummary(NOV)
    expect(nov.expenseBreakdown).toEqual([
      { category: 'SALARY', amount: '29500.00' },
      { category: 'UTILITIES', amount: '1350.00' },
      { category: 'PURCHASE', amount: '12000.50' },
      { category: 'OTHER', amount: '300.00' },
    ])
  })

  it('待收单据与逾期：未结清应收含派生统计，逾期余额 40,800.01', async () => {
    const nov = await store.getDashboardSummary(NOV)
    expect(nov.overdueReceivableOutstanding).toBe('40800.01')
    expect(nov.pendingReceivables.length).toBeGreaterThan(0)
    // 待收单据均为未结清（未收 > 0）
    for (const view of nov.pendingReceivables) {
      expect(view.summary.outstandingAmount).not.toBe('0')
    }
  })
})
