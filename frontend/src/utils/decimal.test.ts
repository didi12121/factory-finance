import { describe, expect, it } from 'vitest'

import {
  addAmounts,
  compareAmounts,
  isDecimalString,
  multiplyAmounts,
  roundToScale,
  subtractAmounts,
  toFixedDecimals,
} from '@/utils/decimal'

describe('十进制精确运算（中间运算层）', () => {
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
    expect(toFixedDecimals('0.5', 2)).toBe('0.50')
    expect(toFixedDecimals('-0.5', 2)).toBe('-0.50')
  })

  it('拒绝非规范化十进制输入（含千分位/科学计数法）', () => {
    expect(isDecimalString('1850.39')).toBe(true)
    expect(isDecimalString('1,000.00')).toBe(false)
    expect(isDecimalString('1e5')).toBe(false)
    expect(isDecimalString('01.00')).toBe(false)
    expect(() => addAmounts('1,000.00', '1')).toThrow()
    expect(() => compareAmounts('1e5', '1')).toThrow()
  })
})

describe('compareAmounts 精确比较（BigInt 定点）', () => {
  it('基本比较', () => {
    expect(compareAmounts('0.1', '0.2')).toBe(-1)
    expect(compareAmounts('0.2', '0.1')).toBe(1)
    expect(compareAmounts('0.1', '0.10')).toBe(0)
    expect(compareAmounts('-100.00', '0.01')).toBe(-1)
    expect(compareAmounts('0.01', '-100.00')).toBe(1)
    expect(compareAmounts('-100.00', '-100')).toBe(0)
  })

  it('不同小数位与大数比较无精度损失', () => {
    expect(compareAmounts('1.05', '1.049')).toBe(1)
    expect(compareAmounts('1.049', '1.05')).toBe(-1)
    expect(compareAmounts('9999999999999999.99', '9999999999999999.98')).toBe(1)
    expect(compareAmounts('10000000000000000', '9999999999999999.99')).toBe(1)
    expect(compareAmounts('-0', '0')).toBe(0)
  })

  it('禁止 Number/parseFloat 误差：0.1+0.2 边界', () => {
    // Number 运算下 0.1 + 0.2 = 0.30000000000000004，精确比较必须不受影响
    expect(compareAmounts(addAmounts('0.1', '0.2'), '0.3')).toBe(0)
  })
})
