/**
 * 人民币业务金额（DECIMAL(18,2)）的格式与范围校验、展示格式化 —— 业务金额合法性层。
 *
 * 契约（与 utils/decimal.ts 的中间精确运算层分离）：
 * - 业务金额 = 最多 18 位有效数字、2 位小数（整数位最多 16 位，含号），
 *   即范围 -9999999999999999.99 ~ 9999999999999999.99（DECIMAL(18,2)）；
 * - 用户输入允许合法千分位（每组 3 位、仅数字之间），非法逗号格式整体拒绝，
 *   禁止"删除逗号后接受非法输入"；禁止科学计数法与多余前导零；
 * - 金额比较与计算走 decimal.ts 的精确运算（BigInt 定点），
 *   禁止 Number / parseFloat / 浮点运算；
 * - 格式化仅用于展示层，禁止反向解析格式化文本参与计算。
 */

import { roundToScale, type DecimalString } from './decimal'

/** DECIMAL(18,2)：整数位最多 16 位 */
export const MAX_INTEGER_DIGITS = 16

/** 整数部分：无分隔（0 或 1-16 位非前导零数字）或合法千分位分组 */
const PLAIN_INT = '(0|[1-9]\\d{0,15})'
const GROUPED_INT = '[1-9]{1,3}(,\\d{3})+'
/** 业务金额整体：可选负号 + 整数 + 可选最多两位小数 */
const BUSINESS_AMOUNT_RE = new RegExp(`^-?(${PLAIN_INT}|${GROUPED_INT})(\\.\\d{1,2})?$`)

/**
 * 校验用户输入是否为合法业务金额（允许合法千分位，允许负数）。
 *
 * formatExamples:
 * isValidAmount('0.00') → true
 * isValidAmount('1,000.00') → true
 * isValidAmount('1,2,3') → false（千分位分组非法）
 * isValidAmount('1e5') → false（禁止科学计数法）
 * isValidAmount('1.234') → false（超过两位小数）
 * isValidAmount('10000000000000000.00') → false（超过 DECIMAL(18,2) 整数位范围）
 */
export function isValidAmount(value: string): boolean {
  const cleaned = value.trim()
  if (!BUSINESS_AMOUNT_RE.test(cleaned)) {
    return false
  }
  return withinDecimalPrecision(cleaned)
}

/** 整数位不超过 16 位（DECIMAL(18,2)），小数位不超过 2 位 */
function withinDecimalPrecision(cleaned: string): boolean {
  const unsigned = cleaned.startsWith('-') ? cleaned.slice(1) : cleaned
  const [intPart = '0'] = unsigned.split('.')
  const intDigits = intPart.replace(/,/g, '').replace(/^0$/, '')
  return intDigits.length <= MAX_INTEGER_DIGITS
}

/**
 * 归一化用户输入：校验严格格式（含千分位合法性与 DECIMAL(18,2) 范围）后，
 * 去除合法千分位并返回规范化十进制字符串；非法输入返回 null。
 *
 * normalizeAmount(' 1,000.00 ') → '1000.00'
 * normalizeAmount('1,,000')     → null
 */
export function normalizeAmount(value: string): DecimalString | null {
  const cleaned = value.trim()
  if (!isValidAmount(cleaned)) {
    return null
  }
  return cleaned.replace(/,/g, '')
}

export interface FormatAmountOptions {
  /** 小数位，默认 2 */
  decimals?: number
  /** 千分位分隔，默认 true */
  grouping?: boolean
}

/**
 * 格式化金额字符串（输入必须为规范化十进制字符串）。
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
 * 解析用户输入为规范化金额字符串（严格校验，去除合法千分位）。
 * 非法输入返回 null；不允许科学计数法、非法逗号格式或隐式浮点舍入。
 */
export function parseAmountInput(input: string): DecimalString | null {
  return normalizeAmount(input)
}
