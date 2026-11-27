/**
 * 日历值桥接（唯一接触 @internationalized/date 的模块）。
 *
 * 说明：reka-ui 2.11 的 DatePicker/Calendar/RangeCalendar 原语以
 * `@internationalized/date` 的日期值（DateValue）为值模型（reka-ui 自身依赖并随其
 * 锁定分发，本文件是全仓唯一 import 点）。禁止在其他模块直接引用该包；
 * 若未来依赖管理方式变化，仅需替换本文件实现。
 *
 * 类型互通：reka-ui 的 DateValue 与 @internationalized/date 的 CalendarDate 存在
 * 声明身份差异（私有字段名义类型），构造结果在本文件内一次性收窄为 reka-ui 的
 * DateValue 类型；其余模块只依赖 reka-ui 一侧类型。
 *
 * 仅做日期值构造/字符串转换，不参与任何财务金额计算；
 * 对外暴露的业务文本仍是 YYYY-MM-DD / YYYY-MM 字符串。
 */

import { CalendarDate } from '@internationalized/date'
import type { CalendarRoot } from 'reka-ui'

import { isDateTextShape, isValidDateText } from './dateText'

/**
 * 日历值类型：直接从 reka-ui CalendarRoot 组件的 prop 声明派生，
 * 保证与 Calendar/DatePicker 原语的值类型为同一身份（避免跨声明名义类型不兼容）。
 */
export type DateValue = NonNullable<InstanceType<typeof CalendarRoot>['$props']['placeholder']>

/** YYYY-MM-DD 文本 → 日历值（非法返回 null） */
export function toDateValue(text: string): DateValue | null {
  const trimmed = text.trim()
  if (!isDateTextShape(trimmed) || !isValidDateText(trimmed)) {
    return null
  }
  const year = Number.parseInt(trimmed.slice(0, 4), 10)
  const month = Number.parseInt(trimmed.slice(5, 7), 10)
  const day = Number.parseInt(trimmed.slice(8, 10), 10)
  return new CalendarDate(year, month, day) as unknown as DateValue
}

/** 日历值 → YYYY-MM-DD 文本（reka-ui DateValue 均可 toString()） */
export function fromDateValue(value: { toString(): string }): string {
  return value.toString()
}

/**
 * 日历显示锚点（仅决定打开日历时展示的月份，不参与任何财务派生计算）。
 * 无显式锚点时取本机当前日期。
 */
export function todayAnchor(): DateValue {
  const now = new Date()
  return new CalendarDate(now.getFullYear(), now.getMonth() + 1, now.getDate()) as unknown as DateValue
}
