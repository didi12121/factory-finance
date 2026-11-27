/**
 * 业务日期文本模型测试：闰年/非法日期/月份/操作时间/区间限制/展示格式化。
 */

import { describe, expect, it } from 'vitest'

import {
  DATE_FORMAT_LABEL,
  composeDateTimeText,
  dateTextState,
  dateTimeDatePart,
  dateTimeTimePart,
  describeEmptyText,
  describeInvalidText,
  describePartialText,
  describeRangeLimitText,
  formatOperationDateTime,
  isValidDateText,
  isValidDateTimeText,
  isValidMonthText,
} from './dateText'

describe('业务日期 YYYY-MM-DD 校验（含闰年）', () => {
  it('合法日期通过', () => {
    expect(isValidDateText('2026-11-30')).toBe(true)
    expect(isValidDateText('2024-02-29')).toBe(true) // 闰年 2 月 29 日
    expect(isValidDateText('2000-02-29')).toBe(true) // 世纪闰年
    expect(isValidDateText('2026-01-01')).toBe(true)
    expect(isValidDateText('2026-12-31')).toBe(true)
  })

  it('非法日期拒绝（2026-02-30 / 平年 2-29 / 越界月日）', () => {
    expect(isValidDateText('2026-02-30')).toBe(false) // 任务示例：非法日期
    expect(isValidDateText('2025-02-29')).toBe(false) // 平年无 2/29
    expect(isValidDateText('2026-13-01')).toBe(false)
    expect(isValidDateText('2026-00-10')).toBe(false)
    expect(isValidDateText('2026-04-31')).toBe(false)
    expect(isValidDateText('2026-1-05')).toBe(false)
    expect(isValidDateText('abc')).toBe(false)
    expect(isValidDateText('')).toBe(false)
  })

  it('非法日期给出专门错误文案（提示月份天数与闰年）', () => {
    expect(describeInvalidText('date', '2026-02-30')).toContain('日期不存在')
    expect(describeInvalidText('date', '2026-02-30')).toContain('闰年')
    expect(describeInvalidText('date', '2025-02-29')).toContain('日期不存在')
    expect(describeInvalidText('date', 'xx')).toContain(DATE_FORMAT_LABEL)
  })
})

describe('会计月份 YYYY-MM 校验', () => {
  it('合法月份通过、非法月份拒绝', () => {
    expect(isValidMonthText('2026-11')).toBe(true)
    expect(isValidMonthText('2026-01')).toBe(true)
    expect(isValidMonthText('2026-13')).toBe(false)
    expect(isValidMonthText('2026-00')).toBe(false)
    expect(isValidMonthText('2026-1')).toBe(false)
  })

  it('月份不存在给出专门文案', () => {
    expect(describeInvalidText('month', '2026-13')).toContain('月份不存在')
  })
})

describe('操作时间 YYYY-MM-DD HH:mm 校验', () => {
  it('合法时间通过、非法时间拒绝', () => {
    expect(isValidDateTimeText('2026-11-30 08:00')).toBe(true)
    expect(isValidDateTimeText('2026-11-30 23:59')).toBe(true)
    expect(isValidDateTimeText('2026-02-30 10:00')).toBe(false) // 非法日期部分
    expect(isValidDateTimeText('2026-11-30 24:00')).toBe(false)
    expect(isValidDateTimeText('2026-11-30 10:60')).toBe(false)
    expect(isValidDateTimeText('2026-11-30T10:00')).toBe(false) // 不接受 ISO 分隔符写法
    expect(isValidDateTimeText('2026-11-30 10:00:00')).toBe(false)
  })

  it('日期/时间部分提取与组装', () => {
    expect(dateTimeDatePart('2026-11-30 08:15')).toBe('2026-11-30')
    expect(dateTimeTimePart('2026-11-30 08:15')).toBe('08:15')
    expect(composeDateTimeText('2026-11-30', '08:15')).toBe('2026-11-30 08:15')
    expect(composeDateTimeText('2026-11-30', '')).toBe('')
    expect(composeDateTimeText('', '08:15')).toBe('')
  })
})

describe('文本状态与错误文案', () => {
  it('空 / 合法 / 中间态 / 非法 四态', () => {
    expect(dateTextState('date', '')).toBe('empty')
    expect(dateTextState('date', '2026-11-30')).toBe('valid')
    expect(dateTextState('date', '2026-1')).toBe('partial')
    expect(dateTextState('date', '2026-1')).toBe('partial')
    expect(dateTextState('date', '2026-02-30')).toBe('invalid')
    expect(dateTextState('month', '2026-')).toBe('partial')
    expect(dateTextState('dateTime', '2026-11-30 1')).toBe('partial')
    expect(dateTextState('dateTime', 'garbage')).toBe('invalid')
  })

  it('中间态/必填空值文案指向业务格式', () => {
    expect(describePartialText('date')).toContain(DATE_FORMAT_LABEL)
    expect(describeEmptyText('date')).toContain('业务日期')
    expect(describeEmptyText('month')).toContain('会计月份')
    expect(describeEmptyText('dateTime')).toContain('操作时间')
  })

  it('min/max 越界文案', () => {
    expect(describeRangeLimitText('date', '2026-11-29', '2026-11-30', undefined)).toBe(
      '日期不得早于 2026-11-30',
    )
    expect(describeRangeLimitText('date', '2026-12-01', undefined, '2026-11-30')).toBe(
      '日期不得晚于 2026-11-30',
    )
    expect(describeRangeLimitText('date', '2026-11-30', '2026-11-30', '2026-11-30')).toBe('')
    expect(describeRangeLimitText('month', '2026-12', undefined, '2026-11')).toBe('会计月份不得晚于 2026-11')
  })
})

describe('操作时间展示格式化（不暴露 ISO 分隔符）', () => {
  it('ISO 日期时间 → YYYY-MM-DD HH:mm', () => {
    expect(formatOperationDateTime('2026-11-20T11:00:00')).toBe('2026-11-20 11:00')
    expect(formatOperationDateTime('2026-11-30T09:01:00')).toBe('2026-11-30 09:01')
    expect(formatOperationDateTime('2026-11-20 11:00')).toBe('2026-11-20 11:00')
    expect(formatOperationDateTime('2026-11-20T11:00')).toBe('2026-11-20 11:00')
  })

  it('无法识别时原样返回（不猜测）', () => {
    expect(formatOperationDateTime('未知')).toBe('未知')
    expect(formatOperationDateTime('')).toBe('')
  })
})
