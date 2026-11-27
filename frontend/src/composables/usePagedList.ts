/**
 * 分页列表加载组合式（服务端分页）：加载竞态保护、页码/页容量、错误展示。
 * 各业务页面以自己的查询构造 fetchPage，公共加载编排不重复实现。
 */

import { ref, type Ref } from 'vue'

import { apiErrorMessage } from '@/services/api'
import type { PageResult } from '@/types/api'

export interface PagedListState<T> {
  rows: Ref<T[]>
  total: Ref<number>
  page: Ref<number>
  pageSize: Ref<number>
  loading: Ref<boolean>
  errorText: Ref<string | null>
  /** 加载当前页（含竞态保护：仅采纳最后一次查询结果） */
  load: () => Promise<void>
  /** 变更页码并加载 */
  setPage: (page: number) => void
  /** 变更页容量并回到第 1 页 */
  setPageSize: (size: number) => void
  /** 筛选变化：回到第 1 页并加载 */
  reload: () => void
}

export function usePagedList<T>(
  fetchPage: (page: number, size: number) => Promise<PageResult<T>>,
  fallbackMessage: string,
): PagedListState<T> {
  const rows = ref<T[]>([]) as Ref<T[]>
  const total = ref(0)
  const page = ref(1)
  const pageSize = ref(20)
  const loading = ref(false)
  const errorText = ref<string | null>(null)

  let loadSeq = 0

  async function load(): Promise<void> {
    const seq = ++loadSeq
    loading.value = true
    errorText.value = null
    try {
      const result = await fetchPage(page.value, pageSize.value)
      if (seq !== loadSeq) {
        return
      }
      rows.value = result.items
      total.value = result.total
    } catch (error) {
      if (seq !== loadSeq) {
        return
      }
      rows.value = []
      total.value = 0
      errorText.value = apiErrorMessage(error, fallbackMessage)
    } finally {
      if (seq === loadSeq) {
        loading.value = false
      }
    }
  }

  function setPage(next: number): void {
    page.value = next
    void load()
  }

  function setPageSize(size: number): void {
    pageSize.value = size
    page.value = 1
    void load()
  }

  function reload(): void {
    page.value = 1
    void load()
  }

  return { rows, total, page, pageSize, loading, errorText, load, setPage, setPageSize, reload }
}
