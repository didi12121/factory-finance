import { describe, expect, it } from 'vitest'

import {
  buildRecentRowModel,
  buildWorkbenchMetrics,
  defaultPeriodFilter,
  describePeriod,
  resolvePeriod,
} from './workbenchModel'
import type { DashboardSummary, FundTransaction } from '@/services/api'

const TODAY = '2026-11-27'

describe('经营概览统计期间派生（真实今天，可注入）', () => {
  it('本月/上月/最近 30 天/自定义', () => {
    expect(resolvePeriod({ preset: 'thisMonth', customFrom: '', customTo: '' }, TODAY)).toEqual({
      from: '2026-11-01',
      to: '2026-11-30',
    })
    expect(resolvePeriod({ preset: 'lastMonth', customFrom: '', customTo: '' }, TODAY)).toEqual({
      from: '2026-10-01',
      to: '2026-10-31',
    })
    expect(resolvePeriod({ preset: 'last30Days', customFrom: '', customTo: '' }, TODAY)).toEqual({
      from: '2026-10-29',
      to: '2026-11-27',
    })
    // 自动规范化 from ≤ to
    expect(
      resolvePeriod({ preset: 'custom', customFrom: '2026-11-10', customTo: '2026-11-02' }, TODAY),
    ).toEqual({ from: '2026-11-02', to: '2026-11-10' })
  })

  it('默认筛选为本月且自定义区间预置为本月', () => {
    const filter = defaultPeriodFilter(TODAY)
    expect(filter.preset).toBe('thisMonth')
    expect(filter.customFrom).toBe('2026-11-01')
    expect(filter.customTo).toBe('2026-11-30')
    expect(describePeriod({ from: '2026-11-01', to: '2026-11-30' })).toBe('2026-11-01 ~ 2026-11-30')
  })

  it('月末边界（1 月最后一天回退上月）', () => {
    expect(resolvePeriod({ preset: 'lastMonth', customFrom: '', customTo: '' }, '2026-03-31')).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
    })
    // 闰年 2 月
    expect(resolvePeriod({ preset: 'thisMonth', customFrom: '', customTo: '' }, '2024-02-15')).toEqual({
      from: '2024-02-01',
      to: '2024-02-29',
    })
  })
})

function buildSummary(): DashboardSummary {
  return {
    asOf: TODAY,
    period: { from: '2026-11-01', to: '2026-11-30' },
    totalFundBalance: '123456.78',
    periodContribution: '50000.00',
    periodInflow: '80000.50',
    periodActualExpenses: '23456.78',
    expenseBreakdown: [{ category: 'SALARY', amount: '20000.00' }],
    cashFlowTrend: [{ date: '2026-11-01', inflow: '100.00', outflow: '50.00' }],
    recentTransactions: [],
  }
}

describe('经营概览指标装配（业务与财务分离）', () => {
  it('指标含当前资金余额/期间股东出资/期间资金流入/期间实际支出', () => {
    const metrics = buildWorkbenchMetrics(buildSummary())
    const byKey = Object.fromEntries(metrics.map((m) => [m.key, m]))

    expect(byKey.fundBalance?.value).toBe('123456.78')
    expect(byKey.periodContribution?.value).toBe('50000.00')
    expect(byKey.periodInflow?.value).toBe('80000.50')
    expect(byKey.periodExpenses?.value).toBe('23456.78')

    // 应收相关区域标注「待开通」，不显假数字
    expect(byKey.receivableOutstanding?.value).toBeNull()
    expect(byKey.receivableOutstanding?.caption).toBe('待开通')
  })

  it('不标注「净利润」（资金结余 ≠ 净利润）', () => {
    const metrics = buildWorkbenchMetrics(buildSummary())
    for (const metric of metrics) {
      expect(`${metric.label}${metric.caption}`).not.toContain('净利润')
    }
  })
})

describe('近期流水展示装配', () => {
  const txn: FundTransaction = {
    id: 't-1',
    transactionNo: 'FT-001',
    transactionType: 'SHAREHOLDER_CONTRIBUTION',
    tradeDate: '2026-11-25',
    accountId: 'acct-1',
    direction: 'IN',
    amount: '1850.39',
    counterparty: '张三',
    sourceDocType: 'CONTRIBUTION',
    sourceDocId: 'c-1',
    transferGroupId: null,
    status: 'RECORDED',
    remark: null,
    createdAt: '2026-11-25T10:00:00',
    voidedAt: null,
  }

  it('金额带符号展示（展示层格式化，流入 + / 流出 −）', () => {
    const model = buildRecentRowModel(txn)
    expect(model.dateLabel).toBe('11-25')
    expect(model.typeLabel).toBe('股东出资')
    expect(model.signedAmount).toBe('+1,850.39')
    expect(model.directionWord).toBe('流入')
    expect(model.tone).toBe('in')

    const out = buildRecentRowModel({ ...txn, direction: 'OUT', amount: '2000' })
    expect(out.signedAmount).toBe('−2,000.00')
    expect(out.directionWord).toBe('流出')
    expect(out.tone).toBe('out')
  })
})
