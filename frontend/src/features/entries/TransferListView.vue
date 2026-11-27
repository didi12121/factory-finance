<script setup lang="ts">
/**
 * 转账录入（真实 API：GET/POST /treasury/transfers + /{id}/void）。
 * 列表（分页/搜索/日期/状态筛选）+ 转账录入对话框 + 撤销（保留原单据 + 反向流水）。
 * 转账确认后同事务生成 OUT+IN 成对流水：账户间划转不产生收支，整体资金净变化为 0。
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
import { masterdataApi, treasuryApi, type FundAccount, type TransferRecord } from '@/services/api'
import { buildTransferColumns, type TransferDisplayRow } from './entryColumns'
import { accountOptions, toTransferInput, validateTransferForm } from './entryModel'

const adapter: EntryPageAdapter<TransferRecord> = {
  entityLabel: '转账',
  list: (query) => treasuryApi.listTransfers(query),
  create: (values) => treasuryApi.createTransfer(toTransferInput(values)),
  voidRecord: (id, voidDate, reason) => treasuryApi.voidTransfer(id, voidDate, reason),
  validate: validateTransferForm,
  emptyForm: () => ({ fromAccountId: '', toAccountId: '', amount: '', bizDate: '', remark: '' }),
  recordNo: (row) => row.docNo,
  isVoided: (row) => row.status === 'VOIDED',
  recordId: (row) => row.id ?? row.docNo,
}

const page = useEntryPage(adapter, ['fromAccountId', 'toAccountId', 'amount', 'bizDate', 'remark'])

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
    key: 'fromAccountId',
    label: '转出账户',
    type: 'select',
    required: true,
    placeholder: '请选择转出账户',
    options: accountOptions(accounts.value),
  },
  {
    key: 'toAccountId',
    label: '转入账户',
    type: 'select',
    required: true,
    placeholder: '请选择转入账户',
    options: accountOptions(accounts.value),
  },
  { key: 'amount', label: '转账金额', type: 'amount', required: true },
  {
    key: 'bizDate',
    label: '业务日期',
    type: 'date',
    required: true,
    hint: '不得晚于当前业务日期',
  },
  { key: 'remark', label: '备注', type: 'text', placeholder: '选填' },
])

// 展示行：字典名称解析为数据装配（字典晚到时展示行重建 → data 身份变化 → 表格重建）
const displayRows = computed<TransferDisplayRow[]>(() => {
  const accountNames = new Map(accounts.value.map((account) => [account.id, account.name]))
  return page.list.rows.value.map((row) => ({
    ...row,
    fromAccountName: accountNames.get(row.fromAccountName) ?? row.fromAccountName,
    toAccountName: accountNames.get(row.toAccountName) ?? row.toAccountName,
  }))
})

const columns = buildTransferColumns({ onVoid: page.askVoid })

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
      title="转账录入"
      description="账户间划转确认后同事务生成流出/流入成对流水；转账不产生收支，整体资金净变化为 0。"
    >
      <template #actions>
        <Button data-testid="create-transfer" @click="page.openCreate">新增转账</Button>
      </template>
    </PageHeader>

    <FilterBar>
      <SearchInput
        :model-value="page.keyword.value"
        placeholder="搜索转账单号或备注…"
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
        <Button variant="secondary" data-testid="transfers-retry" @click="page.list.load">重试</Button>
      </template>
    </ErrorState>
    <div v-else-if="page.list.loading.value && page.list.rows.value.length === 0" class="rounded-panel border border-border bg-surface">
      <LoadingState :rows="5" label="转账单据加载中" />
    </div>
    <div v-else data-testid="transfers-table">
      <DataTable
        :columns="columns"
        :data="displayRows"
        :loading="page.list.loading.value"
        empty-text="暂无转账单据"
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
      title="新增转账"
      description="确认后同事务生成流出/流入成对流水；账户间划转不产生收支。"
      :fields="formFields"
      :errors="page.formErrors.value"
      :submitting="page.submitting.value"
      submit-text="确认转账"
      @submit="page.submitForm"
    />

    <ConfirmDialog
      v-model:open="page.voidDialogOpen.value"
      title="确认撤销转账单"
      :description="`撤销将保留原单据并生成反向流水，且不可重复撤销。单据：${page.voidTarget.value?.docNo ?? ''}。`"
      confirm-text="确认撤销"
      danger
      @confirm="page.confirmVoid"
    />
  </div>
</template>
