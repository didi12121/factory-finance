/**
 * 日期筛选 → 统计期间（纯函数）。
 * 断言相对 DEMO_TODAY 的真实区间映射，禁用真实当前时间。
 */

import { describe, expect, it } from 'vitest'

import {
  addDays,
  defaultDashboardFilter,
  describePeriod,
  endOfMonth,
  resolvePeriod,
  startOfMonth,
} from '../period'

describe('date helpers（相对 DEMO_TODAY，确定性）', () => {
  it('startOfMonth / endOfMonth', () => {
    expect(startOfMonth('2026-11-30')).toBe('2026-11-01')
    expect(endOfMonth('2026-11-30')).toBe('2026-11-30')
    expect(endOfMonth('2026-10-15')).toBe('2026-10-31')
    expect(endOfMonth('2026-02-10')).toBe('2026-02-28')
  })

  it('addDays 跨月/跨年', () => {
    expect(addDays('2026-11-30', -29)).toBe('2026-11-01')
    expect(addDays('2026-11-01', -1)).toBe('2026-10-31')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
})

describe('resolvePeriod 预设映射', () => {
  it('本月 = DEMO_TODAY 所在整月', () => {
    expect(resolvePeriod({ preset: 'thisMonth', customFrom: '', customTo: '' })).toEqual({
      from: '2026-11-01',
      to: '2026-11-30',
    })
  })

  it('上月 = 上一个整月', () => {
    expect(resolvePeriod({ preset: 'lastMonth', customFrom: '', customTo: '' })).toEqual({
      from: '2026-10-01',
      to: '2026-10-31',
    })
  })

  it('最近 30 天 = [DEMO_TODAY-29, DEMO_TODAY]，含首尾 30 天', () => {
    const period = resolvePeriod({ preset: 'last30Days', customFrom: '', customTo: '' })
    expect(period).toEqual({ from: '2026-11-01', to: '2026-11-30' })
  })

  it('自定义区间自动规范化 from ≤ to', () => {
    expect(
      resolvePeriod({ preset: 'custom', customFrom: '2026-09-30', customTo: '2026-09-01' }),
    ).toEqual({ from: '2026-09-01', to: '2026-09-30' })
  })

  it('默认筛选为本月', () => {
    const filter = defaultDashboardFilter()
    expect(filter.preset).toBe('thisMonth')
    expect(resolvePeriod(filter)).toEqual({ from: '2026-11-01', to: '2026-11-30' })
    expect(describePeriod(resolvePeriod(filter))).toBe('2026-11-01 ~ 2026-11-30')
  })
})
