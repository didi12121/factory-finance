import { describe, expect, it } from 'vitest'

import {
  addAmounts,
  isValidAmount,
  multiplyAmounts,
  normalizeAmount,
  roundToScale,
  subtractAmounts,
} from '@/utils/decimal'

describe('金额格式校验', () => {
  it('接受合法金额格式', () => {
    expect(isValidAmount('0.00')).toBe(true)
    expect(isValidAmount('1850.39')).toBe(true)
    expect(isValidAmount('-1850.39')).toBe(true)
    expect(isValidAmount('1000000.00')).toBe(true)
  })

  it('拒绝科学计数法、非法精度与多余符号', () => {
    expect(isValidAmount('1e5')).toBe(false)
    expect(isValidAmount('1.234')).toBe(false)
    expect(isValidAmount('.5')).toBe(false)
    expect(isValidAmount('01.00')).toBe(false)
    expect(isValidAmount('1,000.00')).toBe(false)
    expect(isValidAmount('--1')).toBe(false)
    expect(isValidAmount('')).toBe(false)
  })

  it('归一化去除千分位与空白', () => {
    expect(normalizeAmount(' 1,850.39 ')).toBe('1850.39')
    expect(normalizeAmount('1e5')).toBeNull()
  })
})

describe('十进制精确运算', () => {
  it('加法无浮点误差', () => {
    expect(addAmounts('0.1', '0.2')).toBe('0.3')
    expect(addAmounts('1850.39', '0.01')).toBe('1850.4')
  })

  it('减法与零值归一化', () => {
    expect(subtractAmounts('1850.39', '1850.39')).toBe('0')
    expect(subtractAmounts('1850.39', '1000')).toBe('850.39')
  })

  it('乘法保留完整精度', () => {
    expect(multiplyAmounts('1.10', '3')).toBe('3.3')
    expect(multiplyAmounts('1.10', '1.10')).toBe('1.21')
  })

  it('舍入为 half-up 且时点明确', () => {
    expect(roundToScale('3.333', 2)).toBe('3.33')
    expect(roundToScale('3.335', 2)).toBe('3.34')
    expect(roundToScale('-3.335', 2)).toBe('-3.34')
    expect(roundToScale('3.335', 4)).toBe('3.335')
  })
})
