<script setup lang="ts">
/**
 * 收款单列表：筛选（客户/账户/日期/搜索）+ DataTable（金额列 compareAmounts 精确排序、
 * 本地分页）+ 收款单详情（DetailSheet）。
 *
 * 数据只经 usePrototypeStore 读取：列表走 listReceipts（契约查询语义），
 * 已核销/未分配/核销状态由核销明细实时派生（buildReceiptRowViews）。
 */
import { computed, h, ref, watch, type Ref, type VNode } from 'vue'
import { createColumnHelper, type ColumnDef } from '@tanstack/vue-table'

import Button from '@/components/ui/button/Button.vue'
import Select from '@/components/ui/select/Select.vue'
import { amountSortingFn } from '@/components/shared/tableSorting'
import DataTable from '@/components/shared/DataTable.vue'
import DateField from './DateField.vue'
import DocumentNumber from '@/components/finance/DocumentNumber.vue'
import ErrorState from '@/components/shared/ErrorState.vue'
import FilterBar from '@/components/shared/FilterBar.vue'
import FinancialStatus from '@/components/finance/FinancialStatus.vue'
import MoneyText from '@/components/finance/MoneyText.vue'
import SearchInput from '@/components/shared/SearchInput.vue'
import type { EntityId, Receipt, ReceiptDetail, ReceiptListQuery } from '@/features/prototype/contracts'
import { usePrototypeStore } from '@/features/prototype/stores/prototype'
import ReceiptDetailSheet from './ReceiptDetailSheet.vue'
import { buildReceiptRowViews, type ReceiptRowView } from './receiptModel'

const store = usePrototypeStore()

/* ------------------------------ 筛选 ------------------------------ */

/** 筛选 Select 的“全部”哨兵值（reka-ui 禁止选项 value 为空串） */
const FILTER_ALL = 'all'

const keyword = ref('')
const filterCustomerId = ref(FILTER_ALL)
const filterAccountId = ref(FILTER_ALL)
const dateFrom = ref('')
const dateTo = ref('')

const customerFilterOptions = computed(() => [
  { label: '全部客户', value: FILTER_ALL },
  ...store.customers.map((item) => ({ label: item.name, value: item.id })),
])

const accountFilterOptions = computed(() => [
  { label: '全部账户', value: FILTER_ALL },
  ...store.fundAccounts.map((item) => ({ label: item.name, value: item.id })),
])

function resetFilters(): void {
  keyword.value = ''
  filterCustomerId.value = FILTER_ALL
  filterAccountId.value = FILTER_ALL
  dateFrom.value = ''
  dateTo.value = ''
}

/* ------------------------------ 数据加载 ------------------------------ */

const loading = ref(false)
const loadError = ref<string | null>(null)
let loadGeneration = 0

async function load(): Promise<void> {
  const generation = ++loadGeneration
  loading.value = true
  loadError.value = null
  try {
    const query: ReceiptListQuery = {
      page: 1,
      size: 500,
      keyword: keyword.value.trim() === '' ? undefined : keyword.value.trim(),
      customerId: filterCustomerId.value === FILTER_ALL ? undefined : filterCustomerId.value,
      accountId: filterAccountId.value === FILTER_ALL ? undefined : filterAccountId.value,
      dateRange:
        dateFrom.value === '' && dateTo.value === ''
          ? undefined
          : { from: dateFrom.value === '' ? null : dateFrom.value, to: dateTo.value === '' ? null : dateTo.value },
    }
    const result = await store.listReceipts(query)
    if (generation !== loadGeneration) {
      return
    }
    loadedReceipts.value = result.items
  } catch (error) {
    if (generation !== loadGeneration) {
      return
    }
    loadedReceipts.value = []
    loadError.value = error instanceof Error ? error.message : '收款单加载失败，请重试'
  } finally {
    if (generation === loadGeneration) {
      loading.value = false
    }
  }
}

const loadedReceipts: Ref<Receipt[]> = ref([])

/** 行视图：列表快照 + 核销明细实时派生（确认后无需等待刷新即更新） */
const rowsView = computed(() =>
  buildReceiptRowViews(loadedReceipts.value, store.receiptAllocations, store.customers, store.fundAccounts),
)

watch([keyword, filterCustomerId, filterAccountId, dateFrom, dateTo], () => void load())
// 新增收款单后刷新列表（核销派生列随 receiptAllocations 实时更新）
watch(() => store.receipts.length, () => void load())

void load()

/* ------------------------------ 详情 ------------------------------ */

const sheetOpen = ref(false)
const selectedDetail = ref<ReceiptDetail | null>(null)

function openDetail(id: EntityId): void {
  selectedDetail.value = store.receiptDetailById(id)
  sheetOpen.value = true
}

/* ------------------------------ 列定义 ------------------------------ */

/**
 * 关键列内容容器（QA F-007）：min-width ≥ 96px + 不换行，
 * 390px 下避免逐字竖排；宽表在 Table 容器内横向滚动，页面无横向溢出。
 */
function keyCell(content: string | VNode): VNode {
  return h('div', { class: 'min-w-[96px] whitespace-nowrap' }, [content])
}

const columnHelper = createColumnHelper<ReceiptRowView>()

const columns: ColumnDef<ReceiptRowView, string>[] = [
  columnHelper.accessor('receipt.receiptNo', {
    id: 'receiptNo',
    header: '收款单编号',
    cell: (info) => keyCell(h(DocumentNumber, { value: info.getValue() })),
  }),
  columnHelper.accessor('customerName', {
    header: '客户',
    cell: (info) => keyCell(info.getValue()),
  }),
  columnHelper.accessor('receipt.receiptDate', {
    id: 'receiptDate',
    header: '收款日期',
    cell: (info) => h('div', { class: 'whitespace-nowrap' }, info.getValue()),
  }),
  columnHelper.accessor('accountName', {
    header: '收款账户',
    cell: (info) => keyCell(info.getValue()),
  }),
  columnHelper.accessor('receipt.actualAmount', {
    id: 'actualAmount',
    header: '实际收款金额',
    meta: { align: 'right' },
    sortingFn: amountSortingFn,
    cell: (info) => h(MoneyText, { value: info.getValue(), size: 'table', class: 'whitespace-nowrap' }),
  }),
  columnHelper.accessor('allocatedAmount', {
    header: '已核销金额',
    meta: { align: 'right' },
    sortingFn: amountSortingFn,
    cell: (info) => h(MoneyText, { value: info.getValue(), size: 'table', class: 'whitespace-nowrap' }),
  }),
  columnHelper.accessor('unallocatedAmount', {
    header: '未分配金额',
    meta: { align: 'right' },
    sortingFn: amountSortingFn,
    cell: (info) => h(MoneyText, { value: info.getValue(), size: 'table', class: 'whitespace-nowrap' }),
  }),
  columnHelper.accessor('receipt.externalRef', {
    id: 'externalRef',
    header: '外部流水参考号',
    cell: (info) => keyCell(h(DocumentNumber, { value: info.getValue() ?? '—' })),
  }),
  columnHelper.accessor('statusLabel', {
    header: '状态',
    cell: (info) =>
      h(FinancialStatus, {
        status: info.getValue(),
        kind: info.row.original.statusKind,
      }),
  }),
  {
    id: 'actions',
    header: '操作',
    meta: { align: 'right' },
    enableSorting: false,
    cell: (info) =>
      h(
        Button,
        {
          variant: 'ghost',
          size: 'sm',
          'data-testid': `receipt-detail-${info.row.original.receipt.id}`,
          onClick: () => openDetail(info.row.original.receipt.id),
        },
        () => '详情',
      ),
  },
]
</script>

<template>
  <section class="flex flex-col gap-4" data-testid="receipt-list">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="min-w-0">
        <h2 class="text-section-title font-semibold text-text-primary">收款单</h2>
        <p class="mt-1 text-caption text-text-muted">
          实际收款事实与核销派生金额；未分配金额恒等于实际收款减已核销金额。
        </p>
      </div>
    </div>

    <FilterBar>
      <SearchInput
        v-model="keyword"
        placeholder="搜索单据编号 / 参考号 / 备注…"
        data-testid="receipt-search"
      />
      <Select
        v-model="filterCustomerId"
        :options="customerFilterOptions"
        class="w-44"
        aria-label="按客户筛选"
        data-testid="filter-customer"
      />
      <Select
        v-model="filterAccountId"
        :options="accountFilterOptions"
        class="w-44"
        aria-label="按收款账户筛选"
        data-testid="filter-account"
      />
      <div class="flex flex-wrap items-center gap-2">
        <label
          for="receipt-date-from"
          class="shrink-0 whitespace-nowrap text-caption text-text-muted"
        >
          收款日期
        </label>
        <DateField
          id="receipt-date-from"
          v-model="dateFrom"
          class="w-[150px] shrink-0"
          data-testid="filter-date-from"
        />
        <span class="shrink-0 whitespace-nowrap text-caption text-text-muted">至</span>
        <DateField
          id="receipt-date-to"
          v-model="dateTo"
          class="w-[150px] shrink-0"
          data-testid="filter-date-to"
        />
      </div>
      <Button variant="secondary" size="sm" data-testid="reset-filters" @click="resetFilters">
        重置筛选
      </Button>
    </FilterBar>

    <ErrorState
      v-if="loadError !== null"
      title="收款单加载失败"
      :description="loadError"
      data-testid="receipt-list-error"
    >
      <template #actions>
        <Button variant="secondary" size="sm" @click="void load()">重试</Button>
      </template>
    </ErrorState>

    <div v-else data-testid="receipt-list-table">
      <DataTable
        :columns="columns"
        :data="rowsView"
        :loading="loading"
        empty-text="暂无符合条件的收款单"
      />
    </div>

    <ReceiptDetailSheet :open="sheetOpen" :detail="selectedDetail" @update:open="sheetOpen = $event" />
  </section>
</template>
