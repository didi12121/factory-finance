/**
 * 业务日期（YYYY-MM-DD）日历运算 —— 纯函数，UTC 日历对齐，避免时区漂移。
 *
 * 用途：统计期间派生（本月/上月/最近 30 天）、业务日期上限（不得晚于当前业务日期）。
 * 仅做日历区间派生，不参与财务金额计算；真实「今天」由调用方注入（测试可固定）。
 */

import type { LocalDate } from '@/services/api/types'

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

/** 浏览器本地时区的「今天」（YYYY-MM-DD）；now 参数供测试注入 */
export function todayLocalDate(now: Date = new Date()): LocalDate {
  return formatDate(now.getFullYear(), now.getMonth() + 1, now.getDate())
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

/** 相对某日偏移 n 天（n 可为负） */
export function addDays(value: LocalDate, n: number): LocalDate {
  const { year, month, day } = parseDate(value)
  const shifted = new Date(Date.UTC(year, month - 1, day + n))
  return formatDate(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate())
}

/** 是否为合法 YYYY-MM-DD 日期文本（含闰年校验） */
export function isLocalDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }
  const { year, month, day } = parseDate(value)
  const probe = new Date(Date.UTC(year, month - 1, day))
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() + 1 === month &&
    probe.getUTCDate() === day
  )
}
