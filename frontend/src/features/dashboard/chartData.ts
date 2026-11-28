/**
 * 经营概览 —— 图表数据与 ECharts option 构造（纯函数）。
 *
 * 金额红线（图表边界）：
 * - **仅在本模块构造 ECharts 展示数据时**允许把 DecimalString 转为 Number（柱/条几何值）；
 * - tooltip 与指标**一律使用格式化字符串**（formatAmount，千分位 + 两位小数），
 *   禁止把原始 Number/浮点直接渲染为金额文本；
 * - 不做任何财务统计（统计由 DashboardSummary 契约/Store 提供），只负责展示映射。
 *
 * 颜色：不散落十六进制。调用方传入由 CSS Token 解析出的 `ChartPalette`。
 */

import type { EChartsOption } from 'echarts'

import type { CashFlowTrendPoint, ExpenseCategoryStat } from '@/features/prototype/contracts'
import { formatAmount } from '@/utils/money'
import type { DecimalString } from '@/utils/decimal'

/** 图表调色板（由 CSS Token 在运行时解析后传入，本模块不硬编码颜色） */
export interface ChartPalette {
  inflow: string
  outflow: string
  axisText: string
  axisLine: string
  tooltipBg: string
  tooltipBorder: string
  tooltipText: string
}

/** 业务交易类型显示名（业务中文，支出分类与近期流水共用） */
/** 业务类型图表标签：统一来自契约单一来源（V1.1，F-002 整改），禁止本地定义 */
import { TRANSACTION_TYPE_CHART_LABELS as TRANSACTION_TYPE_LABELS } from '@/features/prototype/contracts/labels'

export { TRANSACTION_TYPE_LABELS }

/** 图表边界：DecimalString → Number（仅用于 ECharts 几何值，禁止参与财务运算） */
function toChartNumber(value: DecimalString): number {
  return Number(value)
}

function format(value: DecimalString): string {
  return formatAmount(value)
}

/** 日期 'YYYY-MM-DD' → 轴标签 'MM-DD' */
function toAxisLabel(date: string): string {
  return date.slice(5)
}

/* ------------------------------- 资金收付趋势 ------------------------------- */

export interface TrendChartData {
  /** 完整日期（tooltip 用） */
  dates: string[]
  /** 轴标签（MM-DD，时间刻度） */
  labels: string[]
  /** 流入几何值（Number，仅 ECharts） */
  inflowValues: number[]
  /** 流出几何值（Number，仅 ECharts） */
  outflowValues: number[]
  /** 流入格式化金额（tooltip/图例用） */
  inflowFormatted: string[]
  /** 流出格式化金额 */
  outflowFormatted: string[]
  hasData: boolean
}

export function buildTrendData(trend: CashFlowTrendPoint[]): TrendChartData {
  const dates = trend.map((point) => point.date)
  return {
    dates,
    labels: dates.map(toAxisLabel),
    inflowValues: trend.map((point) => toChartNumber(point.inflow)),
    outflowValues: trend.map((point) => toChartNumber(point.outflow)),
    inflowFormatted: trend.map((point) => format(point.inflow)),
    outflowFormatted: trend.map((point) => format(point.outflow)),
    hasData: trend.length > 0,
  }
}

/** 趋势 tooltip 文本（格式化字符串） */
export function formatTrendTooltip(data: TrendChartData, dataIndex: number): string {
  const date = data.dates[dataIndex] ?? ''
  const inflow = data.inflowFormatted[dataIndex] ?? '0.00'
  const outflow = data.outflowFormatted[dataIndex] ?? '0.00'
  return `${date}\n流入 ${inflow}\n流出 ${outflow}`
}

export function buildTrendOption(data: TrendChartData, palette: ChartPalette): EChartsOption {
  return {
    tooltip: {
      trigger: 'axis',
      formatter: (params: unknown): string => {
        const list = Array.isArray(params) ? params : [params]
        const first = list[0] as { dataIndex?: number } | undefined
        return formatTrendTooltip(data, first?.dataIndex ?? 0)
      },
      backgroundColor: palette.tooltipBg,
      borderColor: palette.tooltipBorder,
      textStyle: { color: palette.tooltipText },
    },
    legend: {
      data: ['流入', '流出'],
      // F-004：图例显式置顶，避免与 X 轴标签/绘图区重叠
      top: 'top',
      left: 0,
      itemWidth: 12,
      itemHeight: 12,
      textStyle: { color: palette.axisText },
    },
    // F-004：grid 顶部预留图例高度、底部预留 X 轴标签，绘图区互不遮挡（1920/390 均不重叠）
    grid: { left: 8, right: 12, top: 44, bottom: 24, containLabel: true },
    xAxis: {
      type: 'category',
      data: data.labels,
      axisLine: { lineStyle: { color: palette.axisLine } },
      // F-004/窄视口：X 轴时间刻度标签互不重叠（重叠项自动隐藏）
      axisLabel: { color: palette.axisText, hideOverlap: true },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: palette.axisLine, type: 'dashed' } },
      axisLabel: {
        color: palette.axisText,
        formatter: (value: number) => value.toLocaleString('zh-CN'),
      },
    },
    series: [
      {
        name: '流入',
        type: 'bar',
        data: data.inflowValues,
        itemStyle: { color: palette.inflow, borderRadius: [2, 2, 0, 0] },
        barMaxWidth: 18,
      },
      {
        name: '流出',
        type: 'bar',
        data: data.outflowValues,
        itemStyle: { color: palette.outflow, borderRadius: [2, 2, 0, 0] },
        barMaxWidth: 18,
      },
    ],
  }
}

/* -------------------------------- 支出分类 -------------------------------- */

export interface ExpenseChartData {
  /** 分类显示名（业务中文） */
  categories: string[]
  /** 几何值（Number，仅 ECharts） */
  values: number[]
  /** 格式化金额（tooltip 用） */
  formatted: string[]
  hasData: boolean
}

export function buildExpenseData(breakdown: ExpenseCategoryStat[]): ExpenseChartData {
  return {
    categories: breakdown.map(
      (item) =>
        TRANSACTION_TYPE_LABELS[item.category as keyof typeof TRANSACTION_TYPE_LABELS] ?? item.category,
    ),
    values: breakdown.map((item) => toChartNumber(item.amount)),
    formatted: breakdown.map((item) => format(item.amount)),
    hasData: breakdown.length > 0,
  }
}

/** 支出分类 tooltip 文本（格式化字符串） */
export function formatExpenseTooltip(data: ExpenseChartData, dataIndex: number): string {
  const category = data.categories[dataIndex] ?? ''
  const amount = data.formatted[dataIndex] ?? '0.00'
  return `${category} ${amount}`
}

export function buildExpenseOption(data: ExpenseChartData, palette: ChartPalette): EChartsOption {
  return {
    tooltip: {
      trigger: 'item',
      formatter: (params: unknown): string => {
        const p = params as { dataIndex?: number }
        return formatExpenseTooltip(data, p?.dataIndex ?? 0)
      },
      backgroundColor: palette.tooltipBg,
      borderColor: palette.tooltipBorder,
      textStyle: { color: palette.tooltipText },
    },
    grid: { left: 8, right: 24, top: 8, bottom: 8, containLabel: true },
    xAxis: {
      type: 'value',
      // F-005：窄视口刻度精简，避免金额刻度互相重叠
      splitNumber: 3,
      splitLine: { lineStyle: { color: palette.axisLine, type: 'dashed' } },
      axisLabel: {
        color: palette.axisText,
        // F-005：窄视口 X 轴金额刻度不重叠（重叠项自动隐藏）
        hideOverlap: true,
        formatter: (value: number) => value.toLocaleString('zh-CN'),
      },
    },
    yAxis: {
      type: 'category',
      data: data.categories,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: palette.axisText },
    },
    series: [
      {
        name: '支出',
        type: 'bar',
        data: data.values,
        itemStyle: { color: palette.outflow, borderRadius: [0, 2, 2, 0] },
        barMaxWidth: 22,
      },
    ],
  }
}
