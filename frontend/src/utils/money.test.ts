import { describe, expect, it } from 'vitest'

import { formatAmount, isValidAmount, normalizeAmount, parseAmountInput } from '@/utils/money'

describe('业务金额格式校验（DECIMAL(18,2)）', () => {
  it('接受合法业务金额', () => {
    for (const value of [
      '0.00',
      '0.01',
      '-100.00',
      '1,000.00',
      '1000.00',
      '10,000.00',
      '100,000.00',
      '101,000.00',
      '109,999.99',
      '-10,000.00',
      '9,999,999,999,999,999.99',
      '9999999999999999.99',
      '-9999999999999999.99',
      '1,000,000,000,000,000.00',
    ]) {
      expect(isValidAmount(value), value).toBe(true)
    }
  })

  it('拒绝非法千分位、科学计数法与超出精度/范围的输入', () => {
    for (const value of ['1,2,3', '12,34.56', '1,,000', '1e5', '1.234', '10000000000000000.00', '10,000,000,000,000,000.00', '1,00', '01.00', '.5', '--1', '', 'abc']) {
      expect(isValidAmount(value), value).toBe(false)
    }
  })

  it('DECIMAL(18,2) 边界：9999999999999999.99 合法，10000000000000000.00 非法', () => {
    expect(isValidAmount('9999999999999999.99')).toBe(true)
    expect(isValidAmount('10000000000000000.00')).toBe(false)
  })
})

describe('金额输入归一化', () => {
  it('归一化去除合法千分位与空白', () => {
    expect(normalizeAmount(' 1,000.00 ')).toBe('1000.00')
    expect(normalizeAmount('10,000.00')).toBe('10000.00')
    expect(normalizeAmount('-10,000.00')).toBe('-10000.00')
    expect(normalizeAmount('9,999,999,999,999,999.99')).toBe('9999999999999999.99')
    expect(normalizeAmount('-100.00')).toBe('-100.00')
    expect(normalizeAmount('0.00')).toBe('0.00')
  })

  it('非法输入返回 null，不删除逗号后接受', () => {
    expect(normalizeAmount('1,,000')).toBeNull()
    expect(normalizeAmount('1,2,3')).toBeNull()
    expect(normalizeAmount('12,34.56')).toBeNull()
    expect(normalizeAmount('1e5')).toBeNull()
    expect(normalizeAmount('10000000000000000.00')).toBeNull()
    expect(parseAmountInput('1,000.00')).toBe('1000.00')
  })
})

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
    expect(() => formatAmount('10000000000000000.00')).toThrow()
  })
})
