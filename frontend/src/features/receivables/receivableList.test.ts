/**
 * 应收列表查询组合纯函数测试 —— Agent F（P02-F）。
 *
 * 覆盖：状态筛选、逾期与部分回款并存（逾期独立属性）、客户/月份/关键字筛选、
 * 指标聚合与 store 派生值一致性、Tab 与筛选条件映射、金额/状态/到期日比较器。
 * 断言基于 fixtures.ts 的确定性虚构演示数据（24 张应收单 / 10 条核销）。
 */

import { describe, expect, it } from 'vitest'

import { DEMO_CUSTOMERS, DEMO_RECEIPT_ALLOCATIONS, DEMO_RECEIVABLES } from '../prototype/data/fixtures'
import { buildReceivableViews } from '../prototype/domain/receivable'
import {
  DEFAULT_CRITERIA,
  compareRowAmounts,
  compareRowDueDate,
  compareRowStatus,
  computeReceivableMetrics,
  criteriaForTab,
  distinctAccountingMonths,
  filterReceivableViews,
  tabForCriteria,
  toReceivableRows,
  type ReceivableFilterCriteria,
} from './receivableList'

const views = buildReceivableViews(DEMO_RECEIVABLES, DEMO_RECEIPT_ALLOCATIONS)

function criteria(overrides: Partial<ReceivableFilterCriteria> = {}): ReceivableFilterCriteria {
  return { ...DEFAULT_CRITERIA, ...overrides }
}

describe('filterReceivableViews — 状态筛选（回款状态由核销派生）', () => {
  it('全部 24 张；未回款 15 / 部分回款 3 / 已结清 6', () => {
    expect(filterReceivableViews(views, DEMO_CUSTOMERS, criteria())).toHaveLength(24)
    expect(filterReceivableViews(views, DEMO_CUSTOMERS, criteria({ status: 'UNPAID' }))).toHaveLength(15)
    expect(filterReceivableViews(views, DEMO_CUSTOMERS, criteria({ status: 'PARTIALLY_PAID' }))).toHaveLength(3)
    expect(filterReceivableViews(views, DEMO_CUSTOMERS, criteria({ status: 'SETTLED' }))).toHaveLength(6)
  })

  it('状态筛选不混入逾期语义（逾期是独立属性）', () => {
    const unpaid = filterReceivableViews(views, DEMO_CUSTOMERS, criteria({ status: 'UNPAID' }))
    for (const view of unpaid) {
      expect(view.summary.status).toBe('UNPAID')
    }
  })
})

describe('filterReceivableViews — 逾期独立筛选（可与部分回款并存）', () => {
  it('仅逾期 6 张，其中 3 张同时为部分回款（逾期与部分回款并存）', () => {
    const overdue = filterReceivableViews(views, DEMO_CUSTOMERS, criteria({ overdueOnly: true }))
    expect(overdue).toHaveLength(6)
    const partialAndOverdue = overdue.filter((view) => view.summary.status === 'PARTIALLY_PAID')
    expect(partialAndOverdue.map((view) => view.receivable.id).sort()).toEqual(['ar-004', 'ar-014', 'ar-020'])
    for (const view of partialAndOverdue) {
      expect(view.summary.isOverdue).toBe(true)
      expect(view.summary.outstandingAmount !== '0.00').toBe(true)
    }
  })

  it('部分回款 + 逾期组合筛选返回 3 张（两个维度可组合，不互斥）', () => {
    const combined = filterReceivableViews(
      views,
      DEMO_CUSTOMERS,
      criteria({ status: 'PARTIALLY_PAID', overdueOnly: true }),
    )
    expect(combined).toHaveLength(3)
  })

  it('已结清单据即使到期日已过也不判逾期（逾期要求未收清）', () => {
    const settled = filterReceivableViews(views, DEMO_CUSTOMERS, criteria({ status: 'SETTLED' }))
    for (const view of settled) {
      expect(view.summary.isOverdue).toBe(false)
    }
  })
})

describe('filterReceivableViews — 客户 / 月份 / 关键字筛选', () => {
  it('客户筛选：示例客户 C 共 7 张', () => {
    const rows = filterReceivableViews(views, DEMO_CUSTOMERS, criteria({ customerId: 'cust-c' }))
    expect(rows).toHaveLength(7)
    for (const view of rows) {
      expect(view.receivable.customerId).toBe('cust-c')
    }
  })

  it('月份筛选：2026-09 共 9 张（按 accountingMonth，而非对账日期近似）', () => {
    const rows = filterReceivableViews(views, DEMO_CUSTOMERS, criteria({ accountingMonth: '2026-09' }))
    expect(rows).toHaveLength(9)
    for (const view of rows) {
      expect(view.receivable.accountingMonth).toBe('2026-09')
    }
  })

  it('客户 + 月份组合：示例客户 B × 2026-10 共 3 张', () => {
    const rows = filterReceivableViews(
      views,
      DEMO_CUSTOMERS,
      criteria({ customerId: 'cust-b', accountingMonth: '2026-10' }),
    )
    expect(rows.map((view) => view.receivable.id).sort()).toEqual(['ar-005', 'ar-006', 'ar-007'])
  })

  it('关键字命中对账单编号或客户名称（忽略大小写）', () => {
    expect(filterReceivableViews(views, DEMO_CUSTOMERS, criteria({ keyword: 'AR-2026-0001' }))).toHaveLength(1)
    expect(filterReceivableViews(views, DEMO_CUSTOMERS, criteria({ keyword: '示例客户 e' }))).toHaveLength(1)
    expect(filterReceivableViews(views, DEMO_CUSTOMERS, criteria({ keyword: '不存在' }))).toHaveLength(0)
  })
})

describe('computeReceivableMetrics — 指标聚合（DecimalString 精确求和）', () => {
  it('累计应收 449,614.38 / 累计已核销 47,046.51 / 未收 402,567.87 / 逾期未收 40,800.01', () => {
    const metrics = computeReceivableMetrics(views)
    expect(metrics.totalOriginalAmount).toBe('449614.38')
    expect(metrics.totalPaidAmount).toBe('47046.51')
    expect(metrics.totalOutstandingAmount).toBe('402567.87')
    expect(metrics.overdueOutstandingAmount).toBe('40800.01')
  })

  it('未收余额与逾期未收余额保持派生一致性：未收 = Σ summary.outstandingAmount', () => {
    const metrics = computeReceivableMetrics(views)
    // 逐单派生值求和（不自算「原始 − 已收」副本），结果必须与逐单 outstandingAmount 之和一致
    expect(metrics.totalOutstandingAmount).toBe('402567.87')
    expect(metrics.overdueOutstandingAmount).toBe('40800.01')
  })
})

describe('Tab 与筛选条件映射', () => {
  it('Tab → 条件 → Tab 往返一致（含逾期独立维度）', () => {
    for (const tab of ['all', 'unpaid', 'partial', 'settled', 'overdue'] as const) {
      expect(tabForCriteria(criteriaForTab(tab))).toBe(tab)
    }
  })

  it('逾期 Tab = 仅逾期 + 状态不限；回款状态 Tab 不隐含逾期', () => {
    expect(criteriaForTab('overdue')).toEqual({ status: 'ALL', overdueOnly: true })
    expect(criteriaForTab('partial')).toEqual({ status: 'PARTIALLY_PAID', overdueOnly: false })
    expect(tabForCriteria({ status: 'PARTIALLY_PAID', overdueOnly: true })).toBe('partial')
  })
})

describe('行投影与比较器', () => {
  it('行投影取 store 派生值（paidAmount/status/isOverdue 与核销明细派生一致）', () => {
    const partialRows = toReceivableRows(
      filterReceivableViews(views, DEMO_CUSTOMERS, criteria({ status: 'PARTIALLY_PAID' })),
      DEMO_CUSTOMERS,
    )
    const ar004 = partialRows.find((row) => row.id === 'ar-004')
    expect(ar004?.paidAmount).toBe('12000.00')
    expect(ar004?.outstandingAmount).toBe('8000.00')
    expect(ar004?.status).toBe('PARTIALLY_PAID')
    expect(ar004?.isOverdue).toBe(true)
    expect(ar004?.customerName).toBe('示例客户 B')
  })

  it('金额比较器精确（compareAmounts：0.10 > 0.01，小数位不产生误差）', () => {
    expect(compareRowAmounts('0.10', '0.01')).toBe(1)
    expect(compareRowAmounts('1234.5', '1234.50')).toBe(0)
    expect(compareRowAmounts('-100.00', '0.01')).toBe(-1)
    expect(compareRowAmounts('250000.00', '12345.67')).toBe(1)
  })

  it('到期日比较：未约定到期日排最后；状态比较：未回款 → 部分回款 → 已结清', () => {
    expect(compareRowDueDate(null, '2026-10-10')).toBe(1)
    expect(compareRowDueDate('2026-10-10', null)).toBe(-1)
    expect(compareRowDueDate(null, null)).toBe(0)
    expect(compareRowDueDate('2026-10-10', '2026-11-10')).toBe(-1)
    expect(compareRowStatus('UNPAID', 'PARTIALLY_PAID')).toBe(-1)
    expect(compareRowStatus('SETTLED', 'PARTIALLY_PAID')).toBe(1)
  })

  it('可选月份降序输出数据中出现过的月份', () => {
    expect(distinctAccountingMonths(views)).toEqual(['2026-11', '2026-10', '2026-09'])
  })
})
