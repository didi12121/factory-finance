/**
 * 经营概览 —— 日期筛选 → 统计期间（纯函数，确定性）。
 *
 * 红线：
 * - 一律相对 `DEMO_TODAY = '2026-11-30'` 计算，**禁止使用真实当前时间**（Date.now / new Date()）；
 * - 日期运算基于 UTC 日历（Date.UTC）保证跨环境可重放、断言稳定；
 * - 仅做日历区间派生，不参与任何财务金额计算。
 *
 * 统计口径（与 DashboardSummary 契约一致）：
 * - 期间加工收入按应收单 `accountingMonth` 归属（整月计入，不按天摊分）；
 * - 期间实际回款/支出按 `receiptDate` / `tradeDate` 的实际发生日归属；
 * - 余额类指标（当前资金余额 / 当前应收余额）为「当前余额」，不因期间筛选变成期间发生额。
 */

import { DEMO_TODAY, type DashboardPeriod, type LocalDate } from '@/features/prototype/contracts'

/** 日期筛选预设 */
export type DashboardPeriodPreset = 'thisMonth' | 'lastMonth' | 'last30Days' | 'custom'

/** 日期筛选状态 */
export interface DashboardFilter {
  preset: DashboardPeriodPreset
  /** 自定义起（仅 preset=custom 生效） */
  customFrom: LocalDate
  /** 自定义止（仅 preset=custom 生效） */
  customTo: LocalDate
}

interface DateParts {
  year: number
  month: number
  day: number
}

function parseDate(value: LocalDate): DateParts {
  return {
    year: Number(value.slice(0, 4)),
    month: Number(value.slice(5, 7)),
    day: Number(value.slice(8, 10)),
  }
}

function formatDate(year: number, month: number, day: number): LocalDate {
  const mm = String(month).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  return `${year}-${mm}-${dd}`
}

/** 当月第一天 */
export function startOfMonth(value: LocalDate): LocalDate {
  const { year, month } = parseDate(value)
  return formatDate(year, month, 1)
}

/** 当月最后一天（Date.UTC 下月第 0 天 = 本月最后一天） */
export function endOfMonth(value: LocalDate): LocalDate {
  const { year, month } = parseDate(value)
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return formatDate(year, month, lastDay)
}

/** 相对某日偏移 n 天（n 可为负，UTC 日历，不依赖真实时间） */
export function addDays(value: LocalDate, n: number): LocalDate {
  const { year, month, day } = parseDate(value)
  const shifted = new Date(Date.UTC(year, month - 1, day + n))
  return formatDate(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate())
}

/**
 * 解析日期筛选为统计期间（闭区间）。
 * - thisMonth：DEMO_TODAY 所在整月；
 * - lastMonth：DEMO_TODAY 上一个整月（先取本月首日再回退一天，避免月末溢出）；
 * - last30Days：[DEMO_TODAY-29, DEMO_TODAY]，含首尾共 30 天；
 * - custom：用户区间（自动规范化为 from ≤ to）。
 */
export function resolvePeriod(filter: DashboardFilter): DashboardPeriod {
  switch (filter.preset) {
    case 'thisMonth':
      return { from: startOfMonth(DEMO_TODAY), to: endOfMonth(DEMO_TODAY) }
    case 'lastMonth': {
      const lastDayOfPrevMonth = addDays(startOfMonth(DEMO_TODAY), -1)
      return { from: startOfMonth(lastDayOfPrevMonth), to: endOfMonth(lastDayOfPrevMonth) }
    }
    case 'last30Days':
      return { from: addDays(DEMO_TODAY, -29), to: DEMO_TODAY }
    case 'custom': {
      const from = filter.customFrom <= filter.customTo ? filter.customFrom : filter.customTo
      const to = filter.customFrom <= filter.customTo ? filter.customTo : filter.customFrom
      return { from, to }
    }
  }
}

/** 默认日期筛选（本月） */
export function defaultDashboardFilter(): DashboardFilter {
  return {
    preset: 'thisMonth',
    customFrom: startOfMonth(DEMO_TODAY),
    customTo: endOfMonth(DEMO_TODAY),
  }
}

/** 预设显示名（UI 与测试共用） */
export const PRESET_LABELS: Record<DashboardPeriodPreset, string> = {
  thisMonth: '本月',
  lastMonth: '上月',
  last30Days: '最近 30 天',
  custom: '自定义',
}

/** 期间的可读文本（如 "2026-11-01 ~ 2026-11-30"） */
export function describePeriod(period: DashboardPeriod): string {
  return `${period.from} ~ ${period.to}`
}
