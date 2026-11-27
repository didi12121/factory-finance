<script setup lang="ts">
/**
 * 支出录入（真实 API：GET/POST /treasury/expenses + /{id}/void）。
 * 列表（分页/搜索/日期/状态筛选）+ 支出录入对话框 + 撤销（保留原单据 + 反向流水）。
 * 支出确认后同事务生成流出流水；经营费用 ≠ 实际付款，本页录入的是实际资金支出。
 */
import { computed, onMounted, ref, watch } from 'vue'

import { useEntryPage, type EntryPageAdapter } from './useEntryPage'
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue'
import DataTable from '@/components/shared/DataTable.vue'
import ErrorState from '@/components/shared/ErrorState.vue'
import FilterBar from '@/components/shared/FilterBar.vue'
import FormDialog, { type FormFieldSchema } from '@/components/shared/FormDialog.vue'
import LoadingState from '@/components/shared/LoadingState.vue'
import PageHeader from '@/components/shared/PageHeader.vue'
import SearchInput from '@/components/shared/SearchInput.vue'
import Button from '@/components/ui/button/Button.vue'
import { DateRangeInput } from '@/components/ui/date'
import Select from '@/components/ui/select/Select.vue'
import { masterdataApi, treasuryApi, type ExpenseRecord, type FundAccount } from '@/services/api'
import { buildExpenseColumns, type ExpenseDisplayRow } from './entryColumns'
import { accountOptions, toExpenseInput, validateExpenseForm } from './entryModel'

const adapter: EntryPageAdapter<ExpenseRecord> = {
  entityLabel: '支出',
  list: (query) => treasuryApi.listExpenses(query),
  create: (values) => treasuryApi.createExpense(toExpenseInput(values)),
  voidRecord: (id) => treasuryApi.voidExpense(id),
  validate: validateExpenseForm,
  emptyForm: () => ({ category: '', accountId: '', amount: '', bizDate: '', counterparty: '', remark: '' }),
  recordNo: (row) => row.expenseNo,
  isVoided: (row) => row.status === 'VOIDED',
  recordId: (row) => row.id,
}

const page = useEntryPage(adapter, ['category', 'accountId', 'amount', 'bizDate', 'counterparty', 'remark'])

onMounted(page.list.load)
watch([page.keyword, page.dateFrom, page.dateTo, page.statusFilter], page.list.reload)

/* ------------------------------ 字典（下拉） ------------------------------ */

const accounts = ref<FundAccount[]>([])

async function loadDictionaries(): Promise<void> {
  try {
    const accountResult = await masterdataApi.listAccounts({ page: 1, size: 500 })
    accounts.value = accountResult.items
  } catch {
    // 字典加载失败不阻断列表：下拉展示为空，可重试页面加载
  }
}

onMounted(loadDictionaries)

const formFields = computed<FormFieldSchema[]>(() => [
  {
    key: 'category',
    label: '支出分类',
    type: 'select',
    required: true,
    placeholder: '请选择支出分类',
    options: [
      { label: '工资支出', value: 'SALARY' },
      { label: '水电支出', value: 'UTILITIES' },
      { label: '采购支出', value: 'PURCHASE' },
      { label: '其他', value: 'OTHER' },
    ],
  },
  {
    key: 'accountId',
    label: '付款账户',
    type: 'select',
    required: true,
    placeholder: '请选择资金账户',
    options: accountOptions(accounts.value),
  },
  { key: 'amount', label: '支出金额', type: 'amount', required: true },
  {
    key: 'bizDate',
    label: '业务日期',
    type: 'date',
    required: true,
    hint: '不得晚于当前业务日期',
  },
  { key: 'counterparty', label: '交易对手', type: 'text', placeholder: '选填' },
  { key: 'remark', label: '备注', type: 'text', placeholder: '选填' },
])

// 展示行：字典名称解析为数据装配（字典晚到时展示行重建 → data 身份变化 → 表格重建）
const displayRows = computed<ExpenseDisplayRow[]>(() => {
  const accountNames = new Map(accounts.value.map((account) => [account.id, account.accountName]))
  return page.list.rows.value.map((row) => ({
    ...row,
    accountName: accountNames.get(row.accountId) ?? row.accountId,
  }))
})

const columns = buildExpenseColumns({ onVoid: page.askVoid })

const statusOptions = [
  { label: '全部状态', value: 'ALL' },
  { label: '已确认', value: 'CONFIRMED' },
  { label: '已撤销', value: 'VOIDED' },
]

function setKeyword(value: string): void {
  page.keyword.value = value
}

function setStatusFilter(value: string): void {
  page.statusFilter.value = value as 'CONFIRMED' | 'VOIDED' | 'ALL'
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <PageHeader
      title="支出录入"
      description="实际资金支出确认后同事务生成流出流水；经营费用 ≠ 实际付款，此处录入的是资金事实。"
    >
      <template #actions>
        <Button data-testid="create-expense" @click="page.openCreate">新增支出</Button>
      </template>
    </PageHeader>

    <FilterBar>
      <SearchInput
        :model-value="page.keyword.value"
        placeholder="搜索支出单号、对手或备注…"
        data-testid="filter-keyword"
        @update:model-value="setKeyword"
      />
      <div class="flex items-center gap-2">
        <span class="text-caption text-text-muted">业务日期</span>
        <DateRangeInput
          :from="page.dateFrom.value"
          :to="page.dateTo.value"
          from-aria-label="业务开始日期"
          to-aria-label="业务结束日期"
          @update:from="page.dateFrom.value = $event"
          @update:to="page.dateTo.value = $event"
        />
      </div>
      <div data-testid="filter-status" class="w-36">
        <Select
          :model-value="page.statusFilter.value"
          :options="statusOptions"
          aria-label="单据状态"
          @update:model-value="setStatusFilter"
        />
      </div>
      <Button
        variant="secondary"
        size="sm"
        data-testid="clear-filters"
        :disabled="!page.filtersActive.value"
        @click="page.clearFilters"
      >
        清空筛选
      </Button>
    </FilterBar>

    <ErrorState v-if="page.list.errorText.value !== null" :description="page.list.errorText.value">
      <template #actions>
        <Button variant="secondary" data-testid="expenses-retry" @click="page.list.load">重试</Button>
      </template>
    </ErrorState>
    <div v-else-if="page.list.loading.value && page.list.rows.value.length === 0" class="rounded-panel border border-border bg-surface">
      <LoadingState :rows="5" label="支出单据加载中" />
    </div>
    <div v-else data-testid="expenses-table">
      <DataTable
        :columns="columns"
        :data="displayRows"
        :loading="page.list.loading.value"
        empty-text="暂无支出单据"
        :total="page.list.total.value"
        manual-pagination
        :page="page.list.page.value"
        :page-size="page.list.pageSize.value"
        @update:page="page.list.setPage"
        @update:page-size="page.list.setPageSize"
      />
    </div>

    <FormDialog
      v-model:open="page.dialogOpen.value"
      v-model:model-value="page.form.value"
      title="新增支出"
      description="确认后同事务生成对应流出流水。"
      :fields="formFields"
      :errors="page.formErrors.value"
      :submitting="page.submitting.value"
      submit-text="确认支出"
      @submit="page.submitForm"
    />

    <ConfirmDialog
      v-model:open="page.voidDialogOpen.value"
      title="确认撤销支出单"
      :description="`撤销将保留原单据并生成反向流水，且不可重复撤销。单据：${page.voidTarget.value?.expenseNo ?? ''}。`"
      confirm-text="确认撤销"
      danger
      @confirm="page.confirmVoid"
    />
  </div>
</template>
