/**
 * 图表数据与 option 构造（纯函数）。
 * 断言：图表边界 Number 转换（仅 ECharts）、tooltip 用格式化字符串、分类中文、IN/OUT 数据。
 */

import { describe, expect, it } from 'vitest'

import type { CashFlowTrendPoint, ExpenseCategoryStat } from '@/features/prototype/contracts'
import {
  TRANSACTION_TYPE_LABELS,
  buildExpenseData,
  buildExpenseOption,
  buildTrendData,
  buildTrendOption,
  formatExpenseTooltip,
  formatTrendTooltip,
  type ChartPalette,
} from '../chartData'

const palette: ChartPalette = {
  inflow: 'green',
  outflow: 'red',
  axisText: 'gray',
  axisLine: 'line',
  tooltipBg: 'white',
  tooltipBorder: 'border',
  tooltipText: 'text',
}

const trend: CashFlowTrendPoint[] = [
  { date: '2026-11-05', inflow: '8000.00', outflow: '0.00' },
  { date: '2026-11-08', inflow: '3200.35', outflow: '1350.00' },
]

describe('buildTrendData — 收付款趋势', () => {
  it('时间刻度（MM-DD）与 IN/OUT 数据，几何值为 Number、tooltip 为格式化字符串', () => {
    const data = buildTrendData(trend)
    expect(data.hasData).toBe(true)
    expect(data.dates).toEqual(['2026-11-05', '2026-11-08'])
    expect(data.labels).toEqual(['11-05', '11-08'])
    // 图表边界：DecimalString → Number（仅 ECharts 几何值）
    expect(data.inflowValues).toEqual([8000, 3200.35])
    expect(data.outflowValues).toEqual([0, 1350])
    expect(typeof data.inflowValues[0]).toBe('number')
    // tooltip/指标：格式化字符串（千分位 + 两位小数）
    expect(data.inflowFormatted).toEqual(['8,000.00', '3,200.35'])
    expect(data.outflowFormatted).toEqual(['0.00', '1,350.00'])
  })

  it('空趋势 hasData=false', () => {
    expect(buildTrendData([]).hasData).toBe(false)
  })

  it('tooltip 为格式化字符串（非原始 Number）', () => {
    const data = buildTrendData(trend)
    expect(formatTrendTooltip(data, 1)).toBe('2026-11-08\n流入 3,200.35\n流出 1,350.00')
  })

  it('option 序列为 Number 几何值，tooltip formatter 输出格式化字符串', () => {
    const data = buildTrendData(trend)
    const option = buildTrendOption(data, palette)
    const series = option.series as { name: string; data: number[]; type: string }[]
    expect(series).toHaveLength(2)
    expect(series[0].name).toBe('流入')
    expect(series[0].type).toBe('bar')
    expect(series[0].data).toEqual([8000, 3200.35])
    expect(series[1].name).toBe('流出')
    expect(series[1].data).toEqual([0, 1350])

    const tooltip = option.tooltip as { formatter: (params: unknown) => string }
    const text = tooltip.formatter([{ dataIndex: 0 }])
    expect(text).toContain('流入 8,000.00')
    expect(text).toContain('流出 0.00')
  })
})

describe('buildExpenseData — 支出分类', () => {
  const breakdown: ExpenseCategoryStat[] = [
    { category: 'SALARY', amount: '29500.00' },
    { category: 'UTILITIES', amount: '1350.00' },
  ]

  it('分类中文 + 几何值 Number + 格式化金额', () => {
    const data = buildExpenseData(breakdown)
    expect(data.hasData).toBe(true)
    expect(data.categories).toEqual(['工资', '水电'])
    expect(data.values).toEqual([29500, 1350])
    expect(data.formatted).toEqual(['29,500.00', '1,350.00'])
    expect(formatExpenseTooltip(data, 0)).toBe('工资 29,500.00')
  })

  it('option 条形图 + tooltip 格式化', () => {
    const data = buildExpenseData(breakdown)
    const option = buildExpenseOption(data, palette)
    const series = option.series as { type: string; data: number[] }[]
    expect(series[0].type).toBe('bar')
    expect(series[0].data).toEqual([29500, 1350])
    const tooltip = option.tooltip as { formatter: (params: unknown) => string }
    expect(tooltip.formatter({ dataIndex: 1 })).toBe('水电 1,350.00')
  })

  it('空支出 hasData=false', () => {
    expect(buildExpenseData([]).hasData).toBe(false)
  })

  it('交易类型中文标签覆盖全部类型', () => {
    expect(TRANSACTION_TYPE_LABELS.PROCESSING_FEE_RECEIPT).toBe('加工费回款')
    expect(TRANSACTION_TYPE_LABELS.SHAREHOLDER_CONTRIBUTION).toBe('股东出资')
    expect(TRANSACTION_TYPE_LABELS.INTERNAL_TRANSFER).toBe('内部转账')
  })
})
