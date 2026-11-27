/**
 * 业务录入页面编排组合式（出资/支出/转账共用）：
 * 服务端分页列表、关键字/日期/状态筛选、新增对话框、撤销（void）。
 * 实体差异（接口、载荷装配、校验）由 EntryPageAdapter 注入。
 */

import { computed, ref, type Ref } from 'vue'

import { useToast } from '@/components/ui/toast/useToast'
import { usePagedList, type PagedListState } from '@/composables/usePagedList'
import { todayLocalDate } from '@/utils/localDate'
import {
  apiErrorMessage,
  fieldErrorOf,
  type PageResult,
  type RecordStatus,
  type RecordListQuery,
} from '@/services/api'
import type { EntryFormValues } from './entryModel'

/** 状态筛选（ALL = 不限） */
export type EntryStatusFilter = RecordStatus | 'ALL'

/** 实体适配器（差异注入） */
export interface EntryPageAdapter<TRow> {
  entityLabel: string
  list: (query: RecordListQuery) => Promise<PageResult<TRow>>
  create: (values: EntryFormValues) => Promise<TRow>
  voidRecord: (id: string, voidDate: string, reason?: string) => Promise<TRow>
  validate: (values: EntryFormValues) => Record<string, string>
  emptyForm: () => EntryFormValues
  /** 行数据读取：单据编号（确认文案） */
  recordNo: (row: TRow) => string
  /** 行数据读取：是否已撤销（决定撤销按钮可见） */
  isVoided: (row: TRow) => boolean
  /** 行数据读取：内部标识 */
  recordId: (row: TRow) => string
}

export interface EntryPageState<TRow> {
  list: PagedListState<TRow>
  keyword: Ref<string>
  dateFrom: Ref<string>
  dateTo: Ref<string>
  statusFilter: Ref<EntryStatusFilter>
  filtersActive: Ref<boolean>
  clearFilters: () => void
  dialogOpen: Ref<boolean>
  form: Ref<EntryFormValues>
  formErrors: Ref<Record<string, string>>
  submitting: Ref<boolean>
  openCreate: () => void
  submitForm: () => Promise<void>
  voidTarget: Ref<TRow | null>
  voidDialogOpen: Ref<boolean>
  askVoid: (row: TRow) => void
  confirmVoid: () => Promise<void>
}

export function useEntryPage<TRow>(adapter: EntryPageAdapter<TRow>, formFieldKeys: string[]): EntryPageState<TRow> {
  const toast = useToast()
  const keyword = ref('')
  const dateFrom = ref('')
  const dateTo = ref('')
  const statusFilter = ref<EntryStatusFilter>('ALL')

  const list = usePagedList<TRow>(
    (page, size) => {
      const query: RecordListQuery = { page, size }
      const keywordText = keyword.value.trim()
      if (keywordText !== '') {
        query.keyword = keywordText
      }
      if (dateFrom.value !== '') {
        query.from = dateFrom.value
      }
      if (dateTo.value !== '') {
        query.to = dateTo.value
      }
      if (statusFilter.value !== 'ALL') {
        query.status = statusFilter.value
      }
      return adapter.list(query)
    },
    `${adapter.entityLabel}列表加载失败，请稍后重试。`,
  )

  const filtersActive = computed(
    () =>
      keyword.value.trim() !== '' ||
      dateFrom.value !== '' ||
      dateTo.value !== '' ||
      statusFilter.value !== 'ALL',
  )

  function clearFilters(): void {
    keyword.value = ''
    dateFrom.value = ''
    dateTo.value = ''
    statusFilter.value = 'ALL'
    list.reload()
  }

  /* ------------------------------- 新增对话框 ------------------------------- */

  const dialogOpen = ref(false)
  const form = ref<EntryFormValues>(adapter.emptyForm())
  const formErrors = ref<Record<string, string>>({})
  const submitting = ref(false)

  function openCreate(): void {
    form.value = adapter.emptyForm()
    formErrors.value = {}
    dialogOpen.value = true
  }

  async function submitForm(): Promise<void> {
    const validation = adapter.validate(form.value)
    if (Object.keys(validation).length > 0) {
      formErrors.value = validation
      return
    }
    submitting.value = true
    formErrors.value = {}
    try {
      await adapter.create(form.value)
      toast.success(`${adapter.entityLabel}已确认`, '已同事务生成对应资金流水。')
      dialogOpen.value = false
      await list.load()
    } catch (error) {
      formErrors.value = collectFieldErrors(error, formFieldKeys)
      if (Object.keys(formErrors.value).length === 0) {
        toast.error('提交失败', apiErrorMessage(error, '提交失败，请稍后重试。'))
      }
    } finally {
      submitting.value = false
    }
  }

  /* -------------------------------- 撤销 -------------------------------- */

  const voidTarget = ref<TRow | null>(null) as Ref<TRow | null>
  const voidDialogOpen = ref(false)

  function askVoid(row: TRow): void {
    voidTarget.value = row
    voidDialogOpen.value = true
  }

  async function confirmVoid(): Promise<void> {
    const row = voidTarget.value
    if (row === null) {
      return
    }
    try {
      await adapter.voidRecord(adapter.recordId(row), todayLocalDate())
      toast.success('撤销成功', '原单据已保留，已生成反向流水。')
      await list.load()
    } catch (error) {
      toast.error('撤销失败', apiErrorMessage(error, '撤销失败，请稍后重试。'))
    } finally {
      voidTarget.value = null
    }
  }

  return {
    list,
    keyword,
    dateFrom,
    dateTo,
    statusFilter,
    filtersActive,
    clearFilters,
    dialogOpen,
    form,
    formErrors,
    submitting,
    openCreate,
    submitForm,
    voidTarget,
    voidDialogOpen,
    askVoid,
    confirmVoid,
  }
}

/** 后端字段级错误收集 */
function collectFieldErrors(error: unknown, fields: string[]): Record<string, string> {
  const result: Record<string, string> = {}
  for (const field of fields) {
    const message = fieldErrorOf(error, field)
    if (message !== undefined) {
      result[field] = message
    }
  }
  return result
}
