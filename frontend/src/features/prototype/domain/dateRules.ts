/**
 * 日期语义辅助（业务日期 LocalDate / 会计期间 AccountingMonth）。
 *
 * 约定（PROTOTYPE_DATA_CONTRACT 第 5 节）：
 * - LocalDate（YYYY-MM-DD）与 AccountingMonth（YYYY-MM）的字典序 = 时间序，
 *   区间过滤与比较一律用字符串比较，禁止引入真实当前时间；
 * - 本模块仅做格式/区间判定，不参与任何财务金额计算。
 */

import type { AccountingMonth, LocalDate } from '../contracts'
import type { LocalDateRange } from '../contracts'

const LOCAL_DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/
const ACCOUNTING_MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

/** 校验真实存在的公历日期（YYYY-MM-DD） */
export function isValidLocalDate(value: string): boolean {
  if (!LOCAL_DATE_RE.test(value)) {
    return false
  }
  const year = Number.parseInt(value.slice(0, 4), 10)
  const month = Number.parseInt(value.slice(5, 7), 10)
  const day = Number.parseInt(value.slice(8, 10), 10)
  const probe = new Date(Date.UTC(year, month - 1, day))
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  )
}

/** 校验会计期间（YYYY-MM） */
export function isValidAccountingMonth(value: string): boolean {
  return ACCOUNTING_MONTH_RE.test(value)
}

/** 闭区间日期过滤（from/to 为 null 表示该端不限） */
export function isDateInRange(date: LocalDate, range: LocalDateRange): boolean {
  if (range.from !== null && date < range.from) {
    return false
  }
  if (range.to !== null && date > range.to) {
    return false
  }
  return true
}

/**
 * 会计期间是否归属统计区间（按月重叠语义）：
 * 期间加工收入按 accountingMonth 归属，部分月份区间不得把整月应收误认为按天收入；
 * 只要会计月份与 [from, to] 跨越的月份有交集即计入（整月计入一次，不按天摊分）。
 */
export function isAccountingMonthInPeriod(
  month: AccountingMonth,
  range: { from: LocalDate; to: LocalDate },
): boolean {
  return month >= range.from.slice(0, 7) && month <= range.to.slice(0, 7)
}
