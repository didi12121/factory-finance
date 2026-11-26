import type { Row } from '@tanstack/vue-table'

import { compareAmounts } from '@/utils/decimal'

/**
 * 金额列精确排序函数（TanStack Table sortingFn）。
 * 基于 compareAmounts（BigInt 定点）比较，禁止 Number / parseFloat 排序。
 */
export function amountSortingFn<T>(rowA: Row<T>, rowB: Row<T>, columnId: string): number {
  const a = rowA.getValue(columnId)
  const b = rowB.getValue(columnId)
  return compareAmounts(String(a ?? '0'), String(b ?? '0'))
}
