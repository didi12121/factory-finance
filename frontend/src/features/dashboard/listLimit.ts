/**
 * 经营概览动态列表展示条数（展示层 limit，不截断/改写 Store 数据）。
 *
 * - 桌面默认 ≤ 8 条（近期资金流水 / 待收加工费各列）；
 * - 移动端（< 640px）进一步降低列表高度，≤ 5 条；
 * - 顺序沿用 Store/domain 排序语义（待收保持 compareReceivableUrgency 紧迫度优先），
 *   本模块只做展示条数截取。
 */

import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

/** 桌面默认展示条数 */
export const DASHBOARD_LIST_LIMIT = 8

/** 移动端展示条数（进一步降低列表高度） */
export const DASHBOARD_LIST_LIMIT_MOBILE = 5

export function useDashboardListLimit(): Ref<number> {
  const limit = ref(DASHBOARD_LIST_LIMIT)
  let mql: MediaQueryList | null = null

  function sync(): void {
    limit.value = mql !== null && mql.matches ? DASHBOARD_LIST_LIMIT_MOBILE : DASHBOARD_LIST_LIMIT
  }

  onMounted(() => {
    if (typeof window.matchMedia === 'function') {
      mql = window.matchMedia('(max-width: 639px)')
      if (typeof mql.addEventListener === 'function') {
        mql.addEventListener('change', sync)
      }
      sync()
    }
  })

  onBeforeUnmount(() => {
    if (mql !== null && typeof mql.removeEventListener === 'function') {
      mql.removeEventListener('change', sync)
    }
  })

  return limit
}
