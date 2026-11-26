/**
 * 十进制金额字符串的精确运算（BigInt 定点实现）。
 *
 * 财务金额禁止依赖 JavaScript Number 运算；本模块所有输入输出均为十进制字符串，
 * 内部按 10^scale 定点放大为 BigInt 运算，不产生浮点误差。
 */

/** 金额字符串：十进制字符串，禁止使用 Number 承载财务金额 */
export type DecimalString = string

const AMOUNT_RE = /^-?(0|[1-9]\d*)(\.\d{1,2})?$/

/** 宽松十进制（允许高精度中间值，用于运算与舍入） */
const DECIMAL_RE = /^-?(0|[1-9]\d*)(\.\d+)?$/

/** 校验金额格式：整数或最多两位小数，禁止科学计数法、千分位、多余前导零 */
export function isValidAmount(value: string): boolean {
  return AMOUNT_RE.test(value.trim())
}

/**
 * 归一化用户输入：去除空白与千分位逗号后校验格式。
 * 返回归一化的十进制字符串；非法输入返回 null。
 */
export function normalizeAmount(value: string): DecimalString | null {
  const cleaned = value.trim().replace(/,/g, '')
  if (!isValidAmount(cleaned)) {
    return null
  }
  return normalize(cleaned)
}

interface Scaled {
  value: bigint
  scale: number
}

function parseScaled(value: DecimalString): Scaled {
  const cleaned = value.trim()
  if (!DECIMAL_RE.test(cleaned)) {
    throw new Error(`非法金额格式: ${value}`)
  }
  const negative = cleaned.startsWith('-')
  const unsigned = negative ? cleaned.slice(1) : cleaned
  const [intPart = '0', fracPart = ''] = unsigned.split('.')
  const scale = fracPart.length
  const digits = intPart + fracPart.padEnd(scale, '0')
  const value2 = BigInt(digits)
  return { value: negative ? -value2 : value2, scale }
}

function normalize(value: DecimalString): DecimalString {
  const { value: scaled, scale } = parseScaled(value)
  return renderTrimmed(scaled, scale)
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
