<script setup lang="ts">
/**
 * 股东出资（真实 API：GET/POST /treasury/contributions + /{id}/void）。
 * 列表（分页/搜索/日期/状态筛选）+ 出资录入对话框 + 撤销（保留原单据 + 反向流水）。
 * 出资计入所有者权益，禁止计入营业收入。
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
import { masterdataApi, treasuryApi, type ContributionRecord, type FundAccount, type Shareholder } from '@/services/api'
import { buildContributionColumns, type ContributionDisplayRow } from './entryColumns'
import {
  accountOptions,
  shareholderOptions,
  toContributionInput,
  validateContributionForm,
} from './entryModel'

const adapter: EntryPageAdapter<ContributionRecord> = {
  entityLabel: '股东出资',
  list: (query) => treasuryApi.listContributions(query),
  create: (values) => treasuryApi.createContribution(toContributionInput(values)),
  voidRecord: (id) => treasuryApi.voidContribution(id),
  validate: validateContributionForm,
  emptyForm: () => ({ shareholderId: '', accountId: '', amount: '', bizDate: '', remark: '' }),
  recordNo: (row) => row.contributionNo,
  isVoided: (row) => row.status === 'VOIDED',
  recordId: (row) => row.id,
}

const page = useEntryPage(adapter, ['shareholderId', 'accountId', 'amount', 'bizDate', 'remark'])

onMounted(page.list.load)
watch([page.keyword, page.dateFrom, page.dateTo, page.statusFilter], page.list.reload)

/* ------------------------------ 字典（下拉） ------------------------------ */

const accounts = ref<FundAccount[]>([])
const shareholders = ref<Shareholder[]>([])

async function loadDictionaries(): Promise<void> {
  try {
    const [accountResult, shareholderResult] = await Promise.all([
      masterdataApi.listAccounts({ page: 1, size: 500 }),
      masterdataApi.listShareholders({ page: 1, size: 500 }),
    ])
    accounts.value = accountResult.items
    shareholders.value = shareholderResult.items
  } catch {
    // 字典加载失败不阻断列表：下拉展示为空，可重试页面加载
  }
}

onMounted(loadDictionaries)

const formFields = computed<FormFieldSchema[]>(() => [
  {
    key: 'shareholderId',
    label: '股东',
    type: 'select',
    required: true,
    placeholder: '请选择股东',
    options: shareholderOptions(shareholders.value),
  },
  {
    key: 'accountId',
    label: '入账账户',
    type: 'select',
    required: true,
    placeholder: '请选择资金账户',
    options: accountOptions(accounts.value),
  },
  { key: 'amount', label: '出资金额', type: 'amount', required: true },
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
const displayRows = computed<ContributionDisplayRow[]>(() => {
  const accountNames = new Map(accounts.value.map((account) => [account.id, account.accountName]))
  const shareholderNames = new Map(shareholders.value.map((item) => [item.id, item.name]))
  return page.list.rows.value.map((row) => ({
    ...row,
    shareholderName: shareholderNames.get(row.shareholderId) ?? row.shareholderId,
    accountName: accountNames.get(row.accountId) ?? row.accountId,
  }))
})

const columns = buildContributionColumns({ onVoid: page.askVoid })

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
      title="股东出资"
      description="股东出资确认后同事务生成流入流水；出资计入所有者权益，不属于营业收入。"
    >
      <template #actions>
        <Button data-testid="create-contribution" @click="page.openCreate">新增出资</Button>
      </template>
    </PageHeader>

    <FilterBar>
      <SearchInput
        :model-value="page.keyword.value"
        placeholder="搜索出资单号或备注…"
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
        <Button variant="secondary" data-testid="contributions-retry" @click="page.list.load">重试</Button>
      </template>
    </ErrorState>
    <div v-else-if="page.list.loading.value && page.list.rows.value.length === 0" class="rounded-panel border border-border bg-surface">
      <LoadingState :rows="5" label="出资单据加载中" />
    </div>
    <div v-else data-testid="contributions-table">
      <DataTable
        :columns="columns"
        :data="displayRows"
        :loading="page.list.loading.value"
        empty-text="暂无出资单据"
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
      title="新增股东出资"
      description="确认后同事务生成对应流入流水；出资不属于营业收入。"
      :fields="formFields"
      :errors="page.formErrors.value"
      :submitting="page.submitting.value"
      submit-text="确认出资"
      @submit="page.submitForm"
    />

    <ConfirmDialog
      v-model:open="page.voidDialogOpen.value"
      title="确认撤销出资单"
      :description="`撤销将保留原单据并生成反向流水，且不可重复撤销。单据：${page.voidTarget.value?.contributionNo ?? ''}。`"
      confirm-text="确认撤销"
      danger
      @confirm="page.confirmVoid"
    />
  </div>
</template>
