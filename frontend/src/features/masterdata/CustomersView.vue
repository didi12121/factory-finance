<script setup lang="ts">
/**
 * 客户管理（真实 API：GET/POST/PUT /masterdata/customers）。
 * 列表（分页/搜索/状态筛选）+ 新增/编辑对话框 + 启停用；业务编号由后端生成。
 */
import { onMounted, watch } from 'vue'

import { useEntityCrudPage, type EntityCrudAdapter, type FormValues } from '@/composables/useEntityCrudPage'
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
import { masterdataApi, type Customer } from '@/services/api'
import { buildCustomerColumns } from './masterdataColumns'
import {
  emptyMasterdataForm,
  masterdataFormFromRow,
  masterdataFormFromValues,
  toCustomerInput,
  validateMasterdataForm,
} from './masterdataModel'

const adapter: EntityCrudAdapter<Customer> = {
  entityLabel: '客户',
  list: (query) => masterdataApi.listCustomers(query),
  create: (values) => masterdataApi.createCustomer(toCustomerInput(masterdataFormFromValues(values))),
  update: (id, values) => masterdataApi.updateCustomer(id, toCustomerInput(masterdataFormFromValues(values))),
  emptyForm: (): FormValues => ({ ...emptyMasterdataForm() }),
  formFromRow: (row) => ({ ...masterdataFormFromRow(row, true) }),
  validate: (values) => validateMasterdataForm(masterdataFormFromValues(values)),
  isDisabled: (row) => row.status === 'DISABLED',
}

const page = useEntityCrudPage(adapter, ['name', 'contact', 'phone', 'address', 'remark', 'status'])

onMounted(page.list.load)
watch([page.keyword, page.statusFilter], page.list.reload)

const statusOptions = [
  { label: '全部状态', value: 'ALL' },
  { label: '启用', value: 'ENABLED' },
  { label: '停用', value: 'DISABLED' },
]

const columns = buildCustomerColumns({
  onEdit: page.openEdit,
  onToggleStatus: page.askToggleStatus,
})

const formFields: FormFieldSchema[] = [
  { key: 'name', label: '客户名称', type: 'text', required: true, placeholder: '请输入客户名称' },
  { key: 'contact', label: '联系人', type: 'text', placeholder: '选填' },
  { key: 'phone', label: '电话', type: 'text', placeholder: '选填' },
  { key: 'address', label: '地址', type: 'text', placeholder: '选填' },
  { key: 'remark', label: '备注', type: 'text', placeholder: '选填' },
  {
    key: 'status',
    label: '状态',
    type: 'select',
    options: [
      { label: '启用', value: 'ENABLED' },
      { label: '停用', value: 'DISABLED' },
    ],
    hint: '停用客户不可用于新单据，历史单据保留',
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
    <PageHeader title="客户管理" description="客户基础资料；业务编号由系统生成，停用客户不可用于新单据。">
      <template #actions>
        <Button data-testid="create-customer" @click="page.openCreate">新增客户</Button>
      </template>
    </PageHeader>

    <FilterBar>
      <SearchInput
        :model-value="page.keyword.value"
        placeholder="搜索客户编号或名称…"
        data-testid="filter-keyword"
        @update:model-value="setKeyword"
      />
      <div data-testid="filter-status" class="w-36">
        <Select
          :model-value="page.statusFilter.value"
          :options="statusOptions"
          aria-label="客户状态"
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
        <Button variant="secondary" data-testid="customers-retry" @click="page.list.load">重试</Button>
      </template>
    </ErrorState>
    <div v-else-if="page.list.loading.value && page.list.rows.value.length === 0" class="rounded-panel border border-border bg-surface">
      <LoadingState :rows="5" label="客户列表加载中" />
    </div>
    <div v-else data-testid="customers-table">
      <DataTable
        :columns="columns"
        :data="page.list.rows.value"
        :loading="page.list.loading.value"
        empty-text="暂无客户"
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
      title="确认变更客户状态"
      :description="`确认${page.toggleTarget.value?.status === 'ENABLED' ? '停用' : '启用'}客户「${page.toggleTarget.value?.name ?? ''}」？停用后不可用于新单据，历史单据保留。`"
      :confirm-text="page.toggleTarget.value?.status === 'ENABLED' ? '停用' : '启用'"
      @confirm="page.confirmToggleStatus"
    />
  </div>
</template>
