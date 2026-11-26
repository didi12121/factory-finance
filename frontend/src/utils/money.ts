/**
 * 财务金额展示格式化。
 *
 * 展示规则（DESIGN_SYSTEM.md）：
 * - 千分位分隔
 * - 两位小数
 * - 右对齐 + 等宽数字（tabular-nums）
 * - 负数保留负号
 *
 * 格式化仅用于展示层；任何参与运算的金额必须走 utils/decimal.ts 的精确运算，
 * 禁止反向解析格式化文本参与计算。
 */

import { normalizeAmount, roundToScale, type DecimalString } from './decimal'

export interface FormatAmountOptions {
  /** 小数位，默认 2 */
  decimals?: number
  /** 千分位分隔，默认 true */
  grouping?: boolean
}

/**
 * 格式化金额字符串。
 *
 * formatAmount('0')          → '0.00'
 * formatAmount('1850.39')    → '1,850.39'
 * formatAmount('-1850.39')   → '-1,850.39'
 * formatAmount('1000000')    → '1,000,000.00'
 */
export function formatAmount(value: DecimalString, options: FormatAmountOptions = {}): string {
  const { decimals = 2, grouping = true } = options
  const normalized = normalizeAmount(value)
  if (normalized === null) {
    throw new Error(`非法金额格式: ${value}`)
  }
  const rounded = roundToScale(normalized, decimals)
  const negative = rounded.startsWith('-')
  const unsigned = negative ? rounded.slice(1) : rounded
  const [intPart = '0', fracPart = ''] = unsigned.split('.')
  const grouped = grouping ? groupThousands(intPart) : intPart
  const fixedFraction = fracPart.padEnd(decimals, '0')
  const body = decimals > 0 ? `${grouped}.${fixedFraction}` : grouped
  return negative ? `-${body}` : body
}

function groupThousands(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/**
 * 解析用户输入为归一化金额字符串（去除千分位与空白）。
 * 非法输入返回 null，不允许科学计数法或隐式浮点舍入。
 */
export function parseAmountInput(input: string): DecimalString | null {
  return normalizeAmount(input)
}
