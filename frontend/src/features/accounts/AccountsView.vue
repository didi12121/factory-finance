<script setup lang="ts">
/**
 * 资金账户（真实 API：GET/POST/PUT /treasury/accounts）。
 * 列表（分页/搜索/状态筛选）+ 新增/编辑对话框 + 启停用；
 * 业务编号由后端生成；当前余额由有效流水重算，缺失显示 '—'（禁止显假数字）。
 */
import { onMounted, watch } from 'vue'

import { useEntityCrudPage, type EntityCrudAdapter } from '@/composables/useEntityCrudPage'
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue'
import DataTable from '@/components/shared/DataTable.vue'
import ErrorState from '@/components/shared/ErrorState.vue'
import FilterBar from '@/components/shared/FilterBar.vue'
import FormDialog, { type FormFieldSchema } from '@/components/shared/FormDialog.vue'
import LoadingState from '@/components/shared/LoadingState.vue'
import PageHeader from '@/components/shared/PageHeader.vue'
import SearchInput from '@/components/shared/SearchInput.vue'
import Button from '@/components/ui/button/Button.vue'
import Select from '@/components/ui/select/Select.vue'
import { masterdataApi, type FundAccount } from '@/services/api'
import { buildAccountColumns } from './accountColumns'
import {
  ACCOUNT_FORM_KEYS,
  accountFormFromRow,
  emptyAccountForm,
  toAccountInput,
  validateAccountForm,
} from './accountModel'

const adapter: EntityCrudAdapter<FundAccount> = {
  entityLabel: '资金账户',
  list: (query) => masterdataApi.listAccounts(query),
  create: (values) => masterdataApi.createAccount(toAccountInput(values)),
  update: (id, values) => masterdataApi.updateAccount(id, toAccountInput(values)),
  emptyForm: emptyAccountForm,
  formFromRow: accountFormFromRow,
  validate: validateAccountForm,
  isDisabled: (row) => row.status === 'DISABLED',
}

const page = useEntityCrudPage(adapter, [...ACCOUNT_FORM_KEYS])

onMounted(page.list.load)
watch([page.keyword, page.statusFilter], page.list.reload)

const statusOptions = [
  { label: '全部状态', value: 'ALL' },
  { label: '启用', value: 'ENABLED' },
  { label: '停用', value: 'DISABLED' },
]

const columns = buildAccountColumns({
  onEdit: page.openEdit,
  onToggleStatus: page.askToggleStatus,
})

const formFields: FormFieldSchema[] = [
  { key: 'accountName', label: '账户名称', type: 'text', required: true, placeholder: '如：现金/银行/微信' },
  {
    key: 'accountType',
    label: '账户类型',
    type: 'select',
    required: true,
    options: [
      { label: '现金', value: 'CASH' },
      { label: '银行', value: 'BANK' },
      { label: '微信', value: 'WECHAT' },
      { label: '支付宝', value: 'ALIPAY' },
      { label: '其他', value: 'OTHER' },
    ],
  },
  { key: 'openingBalance', label: '期初余额', type: 'amount', required: true },
  { key: 'openingDate', label: '期初日期', type: 'date', required: true },
  { key: 'remark', label: '备注', type: 'text', placeholder: '选填' },
  {
    key: 'status',
    label: '状态',
    type: 'select',
    options: [
      { label: '启用', value: 'ENABLED' },
      { label: '停用', value: 'DISABLED' },
    ],
    hint: '停用账户不可新增流水，历史流水保留',
  },
]

function setKeyword(value: string): void {
  page.keyword.value = value
}

function setStatusFilter(value: string): void {
  page.statusFilter.value = value as 'ENABLED' | 'DISABLED' | 'ALL'
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <PageHeader
      title="资金账户"
      description="资金账户基础资料；账户余额由有效流水与期初余额重算，业务编号由系统生成。"
    >
      <template #actions>
        <Button data-testid="create-account" @click="page.openCreate">新增账户</Button>
      </template>
    </PageHeader>

    <FilterBar>
      <SearchInput
        :model-value="page.keyword.value"
        placeholder="搜索账户编号或名称…"
        data-testid="filter-keyword"
        @update:model-value="setKeyword"
      />
      <div data-testid="filter-status" class="w-36">
        <Select
          :model-value="page.statusFilter.value"
          :options="statusOptions"
          aria-label="账户状态"
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
        <Button variant="secondary" data-testid="accounts-retry" @click="page.list.load">重试</Button>
      </template>
    </ErrorState>
    <div v-else-if="page.list.loading.value && page.list.rows.value.length === 0" class="rounded-panel border border-border bg-surface">
      <LoadingState :rows="5" label="资金账户加载中" />
    </div>
    <div v-else data-testid="accounts-table">
      <DataTable
        :columns="columns"
        :data="page.list.rows.value"
        :loading="page.list.loading.value"
        empty-text="暂无资金账户"
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
      :title="page.dialogTitle.value"
      :fields="formFields"
      :errors="page.formErrors.value"
      :submitting="page.submitting.value"
      :submit-text="page.dialogTitle.value"
      @submit="page.submitForm"
    />

    <ConfirmDialog
      v-model:open="page.toggleDialogOpen.value"
      title="确认变更账户状态"
      :description="`确认${page.toggleTarget.value?.status === 'ENABLED' ? '停用' : '启用'}账户「${page.toggleTarget.value?.name ?? ''}」？停用后不可新增流水，历史流水保留。`"
      :confirm-text="page.toggleTarget.value?.status === 'ENABLED' ? '停用' : '启用'"
      @confirm="page.confirmToggleStatus"
    />
  </div>
</template>
