/**
 * 实体 CRUD 页面编排组合式（主数据/资金账户共用）：
 * 服务端分页列表、关键字/状态筛选、新增/编辑表单对话框、启停用。
 *
 * 实体差异（接口、载荷装配、校验、表单回填）由 EntityCrudAdapter 注入，
 * 公共加载编排（usePagedList）与表单/对话框状态不重复实现。
 */

import { computed, ref, type Ref } from 'vue'

import { useToast } from '@/components/ui/toast/useToast'
import { usePagedList, type PagedListState } from '@/composables/usePagedList'
import {
  apiErrorMessage,
  fieldErrorOf,
  type PageResult,
} from '@/services/api'
import { STATUS_FILTER_ALL, type StatusFilter } from '@/features/masterdata/masterdataModel'

/** 列表查询（分页 + 关键字 + 启停用状态） */
export interface EntityListQuery {
  page: number
  size: number
  keyword?: string
  status?: 'ENABLED' | 'DISABLED'
}

/** 表单值（schema 字段键 → 文本值；金额/枚举均为字符串） */
export type FormValues = Record<string, string>

/** 实体适配器（差异注入） */
export interface EntityCrudAdapter<TRow> {
  entityLabel: string
  list: (query: EntityListQuery) => Promise<PageResult<TRow>>
  create: (values: FormValues) => Promise<TRow>
  update: (id: string, values: FormValues) => Promise<TRow>
  emptyForm: () => FormValues
  formFromRow: (row: TRow) => FormValues
  /** 语义校验：返回字段级错误（空对象即通过） */
  validate: (values: FormValues) => Record<string, string>
  /** 行是否已停用（决定启停用按钮文案与载荷） */
  isDisabled: (row: TRow) => boolean
}

export interface EntityCrudPageState<TRow> {
  list: PagedListState<TRow>
  keyword: Ref<string>
  statusFilter: Ref<StatusFilter>
  filtersActive: Ref<boolean>
  clearFilters: () => void
  dialogOpen: Ref<boolean>
  dialogTitle: Ref<string>
  form: Ref<FormValues>
  formErrors: Ref<Record<string, string>>
  submitting: Ref<boolean>
  openCreate: () => void
  openEdit: (row: TRow) => void
  submitForm: () => Promise<void>
  toggleTarget: Ref<TRow | null>
  toggleDialogOpen: Ref<boolean>
  askToggleStatus: (row: TRow) => void
  confirmToggleStatus: () => Promise<void>
}

/** 后端字段级错误收集（VALIDATION_ERROR → 表单字段错误） */
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

export function useEntityCrudPage<TRow extends { id: string; status?: string }>(
  adapter: EntityCrudAdapter<TRow>,
  formFieldKeys: string[],
): EntityCrudPageState<TRow> {
  const toast = useToast()
  const keyword = ref('')
  const statusFilter = ref<StatusFilter>(STATUS_FILTER_ALL)

  const list = usePagedList<TRow>(
    (page, size) =>
      adapter.list({
        page,
        size,
        keyword: keyword.value.trim() === '' ? undefined : keyword.value.trim(),
        status: statusFilter.value === STATUS_FILTER_ALL ? undefined : statusFilter.value,
      }),
    `${adapter.entityLabel}列表加载失败，请稍后重试。`,
  )

  const filtersActive = computed(
    () => keyword.value.trim() !== '' || statusFilter.value !== STATUS_FILTER_ALL,
  )

  function clearFilters(): void {
    keyword.value = ''
    statusFilter.value = STATUS_FILTER_ALL
    list.reload()
  }

  /* ---------------------------- 新增/编辑对话框 ---------------------------- */

  const dialogOpen = ref(false)
  const dialogTitle = ref('')
  const editingId = ref<string | null>(null)
  const form = ref<FormValues>(adapter.emptyForm())
  const formErrors = ref<Record<string, string>>({})
  const submitting = ref(false)

  function openCreate(): void {
    editingId.value = null
    form.value = adapter.emptyForm()
    formErrors.value = {}
    dialogTitle.value = `新增${adapter.entityLabel}`
    dialogOpen.value = true
  }

  function openEdit(row: TRow): void {
    editingId.value = row.id
    form.value = adapter.formFromRow(row)
    formErrors.value = {}
    dialogTitle.value = `编辑${adapter.entityLabel}`
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
      if (editingId.value === null) {
        await adapter.create(form.value)
        toast.success(`${adapter.entityLabel}创建成功`)
      } else {
        await adapter.update(editingId.value, form.value)
        toast.success(`${adapter.entityLabel}更新成功`)
      }
      dialogOpen.value = false
      await list.load()
    } catch (error) {
      formErrors.value = collectFieldErrors(error, formFieldKeys)
      if (Object.keys(formErrors.value).length === 0) {
        toast.error('操作失败', apiErrorMessage(error, '操作失败，请稍后重试。'))
      }
    } finally {
      submitting.value = false
    }
  }

  /* -------------------------------- 启停用 -------------------------------- */

  const toggleTarget = ref<TRow | null>(null) as Ref<TRow | null>
  const toggleDialogOpen = ref(false)

  function askToggleStatus(row: TRow): void {
    toggleTarget.value = row
    toggleDialogOpen.value = true
  }

  async function confirmToggleStatus(): Promise<void> {
    const row = toggleTarget.value
    if (row === null) {
      return
    }
    try {
      const values = adapter.formFromRow(row)
      values.status = adapter.isDisabled(row) ? 'ENABLED' : 'DISABLED'
      await adapter.update(row.id, values)
      toast.success(values.status === 'ENABLED' ? `${adapter.entityLabel}已启用` : `${adapter.entityLabel}已停用`)
      await list.load()
    } catch (error) {
      toast.error('操作失败', apiErrorMessage(error, '操作失败，请稍后重试。'))
    } finally {
      toggleTarget.value = null
    }
  }

  return {
    list,
    keyword,
    statusFilter,
    filtersActive,
    clearFilters,
    dialogOpen,
    dialogTitle,
    form,
    formErrors,
    submitting,
    openCreate,
    openEdit,
    submitForm,
    toggleTarget,
    toggleDialogOpen,
    askToggleStatus,
    confirmToggleStatus,
  }
}
