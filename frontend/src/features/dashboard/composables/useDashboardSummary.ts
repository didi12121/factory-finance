/**
 * useDashboardSummary —— 经营概览唯一取数组合式。
 *
 * 红线：
 * - 唯一数据源 `usePrototypeStore`，本组合式**不持有财务数据副本、不自行实现统计公式**，
 *   一律调用 Store 的 `getDashboardSummary(period)`（口径见契约 DashboardSummary）；
 * - 期间或底层数据变化时重新取数，保证日期筛选真实改变指标与图表。
 */

import { ref, watch, type Ref } from 'vue'

import type { DashboardPeriod, DashboardSummary } from '@/features/prototype/contracts'
import { usePrototypeStore } from '@/features/prototype/stores/prototype'

export interface UseDashboardSummary {
  summary: Ref<DashboardSummary | null>
  loading: Ref<boolean>
  error: Ref<Error | null>
  reload: () => Promise<void>
}

export function useDashboardSummary(period: Ref<DashboardPeriod>): UseDashboardSummary {
  const store = usePrototypeStore()
  const summary = ref<DashboardSummary | null>(null)
  const loading = ref(false)
  const error = ref<Error | null>(null)
  let requestId = 0

  async function reload(): Promise<void> {
    const id = ++requestId
    loading.value = true
    error.value = null
    try {
      const result = await store.getDashboardSummary({
        from: period.value.from,
        to: period.value.to,
      })
      if (id === requestId) {
        summary.value = result
      }
    } catch (cause) {
      if (id === requestId) {
        error.value = cause instanceof Error ? cause : new Error(String(cause))
      }
    } finally {
      if (id === requestId) {
        loading.value = false
      }
    }
  }

  // 期间变化或底层业务数据变化（Store 集合引用随状态重建）→ 重新取数
  watch(
    [
      () => period.value.from,
      () => period.value.to,
      () => store.fundTransactions,
      () => store.fundAccounts,
      () => store.receivables,
      () => store.receipts,
      () => store.receiptAllocations,
    ],
    () => {
      void reload()
    },
    { immediate: true },
  )

  return { summary, loading, error, reload }
}
