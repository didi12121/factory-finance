/**
 * 金额输出规范化与精确累加（公共辅助）。
 *
 * 红线：所有运算走 `@/utils/decimal.ts` 的 BigInt 定点实现（addAmounts 等），
 * 禁止 parseFloat / Number / Math.round 参与任何财务计算、汇总、排序。
 * 输出统一规范化为 DECIMAL(18,2) 两位小数形态（'5000' → '5000.00'）。
 */

import { addAmounts, toFixedDecimals, type DecimalString } from '@/utils/decimal'

/** 输出金额规范化为 DECIMAL(18,2) 两位小数形态（仅用于输出定宽，不改变精确值） */
export function canonicalAmount2(value: DecimalString): DecimalString {
  return toFixedDecimals(value, 2)
}

/** 精确累加：逐项 addAmounts 求和（BigInt 定点，禁止 Number/浮点），输出规范化两位小数 */
export function sumAmounts(values: DecimalString[]): DecimalString {
  return canonicalAmount2(values.reduce((acc, value) => addAmounts(acc, value), '0'))
}
