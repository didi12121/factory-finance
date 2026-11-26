import { describe, expect, it } from 'vitest'

import { formatAmount, parseAmountInput } from '@/utils/money'

describe('金额展示格式化', () => {
  it('千分位、两位小数、负号保留', () => {
    expect(formatAmount('0.00')).toBe('0.00')
    expect(formatAmount('0')).toBe('0.00')
    expect(formatAmount('1850.39')).toBe('1,850.39')
    expect(formatAmount('-1850.39')).toBe('-1,850.39')
    expect(formatAmount('1000000.00')).toBe('1,000,000.00')
    expect(formatAmount('1000000')).toBe('1,000,000.00')
    expect(formatAmount('1850.5')).toBe('1,850.50')
  })

  it('非法输入抛错，不静默产生错误金额', () => {
    expect(() => formatAmount('abc')).toThrow()
    expect(() => formatAmount('1e5')).toThrow()
  })

  it('解析用户输入', () => {
    expect(parseAmountInput('1,850.39')).toBe('1850.39')
    expect(parseAmountInput('1.234')).toBeNull()
    expect(parseAmountInput('1e5')).toBeNull()
  })
})
