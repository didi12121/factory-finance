/**
 * 十进制金额字符串的精确运算（BigInt 定点实现）—— 中间精确运算层。
 *
 * 契约（与 utils/money.ts 的业务金额校验分离）：
 * - 本模块输入输出均为**规范化十进制字符串**（可含负号，可含高精度小数，
 *   禁止千分位逗号、禁止科学计数法、禁止前导零），用于中间精确运算；
 * - 业务金额（人民币 DECIMAL(18,2)）的格式、范围合法性校验在 money.ts；
 * - 禁止使用 Number / parseFloat / 浮点运算解决金额比较与计算问题。
 */

/** 金额字符串：十进制字符串，禁止使用 Number 承载财务金额 */
export type DecimalString = string

/** 宽松十进制（允许高精度中间值，用于运算与舍入）：无逗号、无科学计数法 */
const DECIMAL_RE = /^-?(0|[1-9]\d*)(\.\d+)?$/

interface Scaled {
  value: bigint
  scale: number
}

/** 校验规范化十进制字符串（中间运算层；不校验 DECIMAL(18,2) 范围） */
export function isDecimalString(value: string): boolean {
  return DECIMAL_RE.test(value.trim())
}

function parseScaled(value: DecimalString): Scaled {
  const cleaned = value.trim()
  if (!DECIMAL_RE.test(cleaned)) {
    throw new Error(`非法十进制金额格式: ${value}`)
  }
  const negative = cleaned.startsWith('-')
  const unsigned = negative ? cleaned.slice(1) : cleaned
  const [intPart = '0', fracPart = ''] = unsigned.split('.')
  const scale = fracPart.length
  const digits = intPart + fracPart.padEnd(scale, '0')
  const scaled = BigInt(digits)
  return { value: negative ? -scaled : scaled, scale }
}

function renderTrimmed(value: bigint, scale: number): DecimalString {
  const negative = value < 0n
  const digits = (negative ? -value : value).toString().padStart(scale + 1, '0')
  const intPart = digits.slice(0, digits.length - scale) || '0'
  let fracPart = scale > 0 ? digits.slice(digits.length - scale) : ''
  fracPart = fracPart.replace(/0+$/, '')
  const body = fracPart ? `${intPart}.${fracPart}` : intPart
  return negative && body !== '0' ? `-${body}` : body
}

function align(a: DecimalString, b: DecimalString): { left: bigint; right: bigint; scale: number } {
  const sa = parseScaled(a)
  const sb = parseScaled(b)
  const scale = Math.max(sa.scale, sb.scale)
  return {
    left: sa.value * 10n ** BigInt(scale - sa.scale),
    right: sb.value * 10n ** BigInt(scale - sb.scale),
    scale,
  }
}

/** 精确加法：'0.1' + '0.2' = '0.3' */
export function addAmounts(a: DecimalString, b: DecimalString): DecimalString {
  const { left, right, scale } = align(a, b)
  return renderTrimmed(left + right, scale)
}

/** 精确减法：'1850.39' - '1850.39' = '0' */
export function subtractAmounts(a: DecimalString, b: DecimalString): DecimalString {
  const { left, right, scale } = align(a, b)
  return renderTrimmed(left - right, scale)
}

/** 精确乘法：结果保留全部有效小数位（scale = 两因子 scale 之和） */
export function multiplyAmounts(a: DecimalString, b: DecimalString): DecimalString {
  const sa = parseScaled(a)
  const sb = parseScaled(b)
  return renderTrimmed(sa.value * sb.value, sa.scale + sb.scale)
}

/**
 * 精确十进制比较：a < b → -1；a = b → 0；a > b → 1。
 * 比较基于 BigInt 定点对齐，禁止 Number / parseFloat / 浮点运算。
 * 输入必须为规范化十进制字符串（千分位等由 money.ts 归一化后再比较）。
 *
 * compareAmounts('-100.00', '0.01') → -1
 * compareAmounts('0.1', '0.10')     → 0
 * compareAmounts('1.05', '1.049')   → 1
 */
export function compareAmounts(a: DecimalString, b: DecimalString): number {
  const { left, right } = align(a, b)
  return left < right ? -1 : left > right ? 1 : 0
}

/**
 * 舍入到指定小数位（四舍五入 / half-up）。
 * 舍入时点必须由对应业务规则明确，禁止对中间结果无依据提前舍入。
 */
export function roundToScale(value: DecimalString, scale: number): DecimalString {
  if (scale < 0 || !Number.isInteger(scale)) {
    throw new Error(`非法小数位: ${scale}`)
  }
  const { value: scaled, scale: currentScale } = parseScaled(value)
  if (scale >= currentScale) {
    return renderTrimmed(scaled * 10n ** BigInt(scale - currentScale), scale)
  }
  const divisor = 10n ** BigInt(currentScale - scale)
  const negative = scaled < 0n
  const abs = negative ? -scaled : scaled
  const quotient = abs / divisor
  const remainder = abs % divisor
  const rounded = remainder * 2n >= divisor ? quotient + 1n : quotient
  return renderTrimmed(negative ? -rounded : rounded, scale)
}

/**
 * 定宽小数位字符串（补零到指定小数位）。
 * 用于输入框失焦展示等需要固定两位小数的场景：'0.5' → '0.50'。
 */
export function toFixedDecimals(value: DecimalString, decimals: number): string {
  const rounded = roundToScale(value, decimals)
  const negative = rounded.startsWith('-')
  const unsigned = negative ? rounded.slice(1) : rounded
  const [intPart = '0', fracPart = ''] = unsigned.split('.')
  const fixedFrac = decimals > 0 ? fracPart.padEnd(decimals, '0') : ''
  const body = decimals > 0 ? `${intPart}.${fixedFrac}` : intPart
  return negative ? `-${body}` : body
}
