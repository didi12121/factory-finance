/**
 * 经营概览视图模型（纯函数）：统计期间派生 + 展示装配。
 *
 * 红线：
 * - 统计期间相对**真实今天**（调用方注入，测试可固定；禁止硬编码演示基准日）；
 * - 金额展示一律 formatAmount（千分位/两位小数），精确运算走 utils/decimal；
 * - 业务与财务分离：股东出资 ≠ 营业收入；资金结余 ≠ 净利润（页面不得标注净利润）。
 */

import type { DashboardSummary, FundTransaction, LocalDate } from '@/services/api'
import { transactionTypeLabel } from '@/services/api'
import { addDays, endOfMonth, startOfMonth } from '@/utils/localDate'
import { formatAmount } from '@/utils/money'

/** 日期筛选预设 */
export type PeriodPreset = 'thisMonth' | 'lastMonth' | 'last30Days' | 'custom'

/** 日期筛选状态 */
export interface PeriodFilterState {
  preset: PeriodPreset
  /** 自定义起（仅 preset=custom 生效） */
  customFrom: LocalDate
  /** 自定义止（仅 preset=custom 生效） */
  customTo: LocalDate
}

/** 预设显示名 */
export const PERIOD_PRESET_LABELS: Record<PeriodPreset, string> = {
  thisMonth: '本月',
  lastMonth: '上月',
  last30Days: '最近 30 天',
  custom: '自定义',
}

/** 默认日期筛选（本月，相对注入的今天） */
export function defaultPeriodFilter(today: LocalDate): PeriodFilterState {
  return {
    preset: 'thisMonth',
    customFrom: startOfMonth(today),
    customTo: endOfMonth(today),
  }
}

/**
 * 解析日期筛选为统计期间（闭区间，from ≤ to）：
 * - thisMonth：今天所在整月；
 * - lastMonth：今天上一个整月（先取本月首日再回退一天，避免月末溢出）；
 * - last30Days：[today-29, today]，含首尾共 30 天；
 * - custom：用户区间（自动规范化为 from ≤ to）。
 */
export function resolvePeriod(filter: PeriodFilterState, today: LocalDate): { from: LocalDate; to: LocalDate } {
  switch (filter.preset) {
    case 'thisMonth':
      return { from: startOfMonth(today), to: endOfMonth(today) }
    case 'lastMonth': {
      const lastDayOfPrevMonth = addDays(startOfMonth(today), -1)
      return { from: startOfMonth(lastDayOfPrevMonth), to: endOfMonth(lastDayOfPrevMonth) }
    }
    case 'last30Days':
      return { from: addDays(today, -29), to: today }
    case 'custom': {
      const from = filter.customFrom <= filter.customTo ? filter.customFrom : filter.customTo
      const to = filter.customFrom <= filter.customTo ? filter.customTo : filter.customFrom
      return { from, to }
    }
  }
}

/* ------------------------------ 指标装配 ------------------------------ */

/** 概览指标行 */
export interface WorkbenchMetric {
  key: string
  label: string
  /** DecimalString；「待开通」指标为 null（禁止显假数字） */
  value: string | null
  caption: string
}

/**
 * 概览指标装配（真实 API 数据）。
 * 应收相关指标未开通：value=null + caption「待开通」，禁止显假数字；
 * 全部指标禁止标注「净利润」。
 */
export function buildWorkbenchMetrics(summary: DashboardSummary): WorkbenchMetric[] {
  return [
    {
      key: 'fundBalance',
      label: '当前资金余额',
      value: summary.totalFundBalance,
      caption: '资金结余 · 可由流水重算',
    },
    {
      key: 'periodContribution',
      label: '期间股东出资',
      value: summary.periodContribution,
      caption: '资金事实 · ≠ 营业收入',
    },
    {
      key: 'periodInflow',
      label: '期间资金流入',
      value: summary.periodInflow,
      caption: '实际收款 · 按发生日',
    },
    {
      key: 'periodExpenses',
      label: '期间实际支出',
      value: summary.periodActualExpenses,
      caption: '资金事实 · 按发生日',
    },
    {
      key: 'receivableOutstanding',
      label: '当前应收余额',
      value: null,
      caption: '待开通',
    },
  ]
}

/* ------------------------------ 近期流水 ------------------------------ */

/** 近期流水行（展示装配） */
export interface RecentRowModel {
  id: string
  /** 日期标签（MM-DD） */
  dateLabel: string
  typeLabel: string
  subtitle: string
  /** 带符号金额（'+1,850.39' / '−1,850.39'，展示层） */
  signedAmount: string
  directionWord: string
  tone: 'in' | 'out'
}

/** 近期流水展示装配（金额仅做展示格式化，禁止参与运算） */
export function buildRecentRowModel(txn: FundTransaction): RecentRowModel {
  const isIn = txn.direction === 'IN'
  return {
    id: txn.id,
    dateLabel: txn.tradeDate.slice(5),
    typeLabel: transactionTypeLabel(txn.transactionType),
    subtitle: txn.counterparty ?? transactionTypeLabel(txn.transactionType),
    signedAmount: `${isIn ? '+' : '−'}${formatAmount(txn.amount)}`,
    directionWord: isIn ? '流入' : '流出',
    tone: isIn ? 'in' : 'out',
  }
}

/** 期间可读文本 */
export function describePeriod(period: { from: LocalDate; to: LocalDate }): string {
  return `${period.from} ~ ${period.to}`
}
