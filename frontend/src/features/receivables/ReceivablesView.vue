<script setup lang="ts">
/**
 * 应收账款列表页 —— Agent F（P02-F）。
 *
 * 红线：
 * - 唯一数据源 `usePrototypeStore`：已收/未收/回款状态/逾期一律读取 store 派生值
 *   （ReceivableSummary），页面禁止自算余额副本；金额聚合/比较走精确运算
 *   （sumAmounts / compareAmounts），禁止 Number/parseFloat；
 * - **逾期是独立属性**：与回款状态（未回款/部分回款/已结清）并列展示、独立筛选，
 *   部分回款单据可同时逾期，禁止用互斥状态覆盖；
 * - 新建应收单调用 `store.createReceivable`（不增加现金、不建收款单/流水、不自动结清）；
 * - 回款入口只经冻结契约 `buildProcessingFeeCreatePath()` 进入加工费回款页
 *   （Agent G），禁止自建回款表单/核销引擎。
 */

import { computed, h, onMounted, ref, type VNode } from 'vue'
import { RouterLink, useRouter } from 'vue-router'

import { createColumnHelper, type ColumnDef, type Row } from '@tanstack/vue-table'

import Button from '@/components/ui/button/Button.vue'
import Select from '@/components/ui/select/Select.vue'
import Tabs from '@/components/ui/tabs/Tabs.vue'
import DocumentNumber from '@/components/finance/DocumentNumber.vue'
import FinancialMetric from '@/components/finance/FinancialMetric.vue'
import FinancialStatus from '@/components/finance/FinancialStatus.vue'
import MoneyText from '@/components/finance/MoneyText.vue'
import DataTable from '@/components/shared/DataTable.vue'
import DemoModeBanner from '@/components/shared/DemoModeBanner.vue'
import ErrorState from '@/components/shared/ErrorState.vue'
import FilterBar from '@/components/shared/FilterBar.vue'
import PageHeader from '@/components/shared/PageHeader.vue'
import SearchInput from '@/components/shared/SearchInput.vue'
import { amountSortingFn } from '@/components/shared/tableSorting'
import {
  DEMO_TODAY,
  buildProcessingFeeCreatePath,
} from '@/features/prototype/contracts'
import { usePrototypeStore } from '@/features/prototype/stores/prototype'
import ReceivableCreateDialog from './ReceivableCreateDialog.vue'
import {
  DEFAULT_CRITERIA,
  STATUS_LABELS,
  compareRowDueDate,
  compareRowStatus,
  computeReceivableMetrics,
  criteriaForTab,
  distinctAccountingMonths,
  filterReceivableViews,
  statusKind,
  tabForCriteria,
  toReceivableRows,
  type ReceivableFilterCriteria,
  type ReceivableRow,
  type ReceivableTab,
  type StatusFilter,
} from './receivableList'

const store = usePrototypeStore()
const router = useRouter()

/* ---------------------------- 顶部财务指标（统计范围：全部应收单） ---------------------------- */

const metrics = computed(() => computeReceivableMetrics(store.receivableViews))

/* ---------------------------- 选项加载（真实异步 → 加载/错误状态） ---------------------------- */

const loading = ref(true)
const loadError = ref(false)

async function loadOptions(): Promise<void> {
  loading.value = true
  loadError.value = false
  try {
    await store.listCustomers({ page: 1, size: 500 })
  } catch {
    loadError.value = true
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void loadOptions()
})

/* ---------------------------- Tab 与筛选（Tab 为预设，筛选栏可组合） ---------------------------- */

const TAB_ITEMS: { value: string; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'unpaid', label: '未回款' },
  { value: 'partial', label: '部分回款' },
  { value: 'settled', label: '已结清' },
  { value: 'overdue', label: '已逾期' },
]

const statusFilter = ref<StatusFilter>('ALL')
const overdueFilter = ref<'ALL' | 'OVERDUE_ONLY'>('ALL')
const customerFilter = ref('all')
const monthFilter = ref('all')
const keyword = ref('')

const activeTab = computed<ReceivableTab>({
  get: () =>
    tabForCriteria({
      status: statusFilter.value,
      overdueOnly: overdueFilter.value === 'OVERDUE_ONLY',
    }),
  set: (tab) => {
    const preset = criteriaForTab(tab)
    statusFilter.value = preset.status
    overdueFilter.value = preset.overdueOnly ? 'OVERDUE_ONLY' : 'ALL'
  },
})

const criteria = computed<ReceivableFilterCriteria>(() => ({
  status: statusFilter.value,
  overdueOnly: overdueFilter.value === 'OVERDUE_ONLY',
  customerId: customerFilter.value === 'all' ? null : customerFilter.value,
  accountingMonth: monthFilter.value === 'all' ? null : monthFilter.value,
  keyword: keyword.value,
}))

const customerOptions = computed(() => [
  { label: '全部客户', value: 'all' },
  ...store.customers.map((item) => ({
    label: item.status === 'ENABLED' ? item.name : `${item.name}（已停用）`,
    value: item.id,
  })),
])

const monthOptions = computed(() => [
  { label: '全部月份', value: 'all' },
  ...distinctAccountingMonths(store.receivableViews).map((month) => ({ label: month, value: month })),
])

const statusOptions = [
  { label: '不限状态', value: 'ALL' },
  { label: STATUS_LABELS.UNPAID, value: 'UNPAID' },
  { label: STATUS_LABELS.PARTIALLY_PAID, value: 'PARTIALLY_PAID' },
  { label: STATUS_LABELS.SETTLED, value: 'SETTLED' },
]

const overdueOptions = [
  { label: '不限逾期', value: 'ALL' },
  { label: '仅逾期', value: 'OVERDUE_ONLY' },
]

function clearFilters(): void {
  statusFilter.value = DEFAULT_CRITERIA.status
  overdueFilter.value = DEFAULT_CRITERIA.overdueOnly ? 'OVERDUE_ONLY' : 'ALL'
  customerFilter.value = 'all'
  monthFilter.value = 'all'
  keyword.value = ''
}

/* ---------------------------- 行数据（筛选结果投影，非数据副本） ---------------------------- */

const rows = computed(() =>
  toReceivableRows(filterReceivableViews(store.receivableViews, store.customers, criteria.value), store.customers),
)

/* ---------------------------- 列定义（金额列 compareAmounts 精确排序） ---------------------------- */

/**
 * 移动端列最小宽度（QA F-007）：关键列内容保持 ≥ 96px 且不换行，
 * 表格容器内横向滚动（Table 根节点 overflow-x-auto），页面保持无非预期横向溢出。
 */
function cellMinWidth(content: VNode | string): VNode {
  return h('span', { class: 'inline-block min-w-24 whitespace-nowrap align-middle' }, content)
}

function dueDateCell(value: string | null): VNode {
  return cellMinWidth(
    value === null
      ? h('span', { class: 'text-caption text-text-muted' }, '—')
      : h('span', { class: 'tabular text-table text-text-primary' }, value),
  )
}

const columnHelper = createColumnHelper<ReceivableRow>()
const columns: ColumnDef<ReceivableRow, string>[] = [
  columnHelper.accessor('statementNo', {
    header: '对账单编号',
    cell: (info) =>
      cellMinWidth(
        h(
          RouterLink,
          {
            to: `/business/receivables/${info.row.original.id}`,
            class: 'inline-flex items-center rounded-control hover:text-brand-foreground focus-visible:outline-2',
            'aria-label': `查看应收单 ${info.row.original.statementNo}`,
          },
          () => h(DocumentNumber, { value: info.row.original.statementNo, link: true }),
        ),
      ),
  }),
  columnHelper.accessor('customerName', {
    header: '客户',
    cell: (info) => cellMinWidth(info.row.original.customerName),
  }),
  columnHelper.accessor('accountingMonth', {
    header: '所属月份',
    cell: (info) => cellMinWidth(info.row.original.accountingMonth),
  }),
  columnHelper.accessor('statementDate', {
    header: '对账日期',
    cell: (info) =>
      cellMinWidth(h('span', { class: 'tabular text-table text-text-primary' }, info.row.original.statementDate)),
  }),
  // 非纯字符串字段用 accessor 函数统一为 string TValue（列值展示一律读 row.original）
  columnHelper.accessor((row: ReceivableRow): string => row.dueDate ?? '', {
    id: 'dueDate',
    header: '到期日期',
    sortingFn: (a: Row<ReceivableRow>, b: Row<ReceivableRow>) =>
      compareRowDueDate(a.original.dueDate, b.original.dueDate),
    cell: (info) => dueDateCell(info.row.original.dueDate),
  }),
  columnHelper.accessor('originalAmount', {
    header: '应收金额',
    meta: { align: 'right' },
    sortingFn: amountSortingFn,
    cell: (info) => cellMinWidth(h(MoneyText, { value: info.row.original.originalAmount, size: 'table' })),
  }),
  columnHelper.accessor('paidAmount', {
    header: '已收金额',
    meta: { align: 'right' },
    sortingFn: amountSortingFn,
    cell: (info) => cellMinWidth(h(MoneyText, { value: info.row.original.paidAmount, size: 'table' })),
  }),
  columnHelper.accessor('outstandingAmount', {
    header: '未收金额',
    meta: { align: 'right' },
    sortingFn: amountSortingFn,
    cell: (info) => cellMinWidth(h(MoneyText, { value: info.row.original.outstandingAmount, size: 'table' })),
  }),
  columnHelper.accessor((row: ReceivableRow): string => row.status, {
    id: 'status',
    header: '回款状态',
    sortingFn: (a: Row<ReceivableRow>, b: Row<ReceivableRow>) =>
      compareRowStatus(a.original.status, b.original.status),
    cell: (info) =>
      cellMinWidth(
        h(FinancialStatus, {
          status: STATUS_LABELS[info.row.original.status],
          kind: statusKind(info.row.original.status),
        }),
      ),
  }),
  columnHelper.accessor((row: ReceivableRow): string => (row.isOverdue ? 'Y' : ''), {
    id: 'isOverdue',
    header: '逾期标识',
    sortingFn: (a: Row<ReceivableRow>, b: Row<ReceivableRow>) => {
      const left = a.original.isOverdue
      const right = b.original.isOverdue
      return left === right ? 0 : left ? 1 : -1
    },
    cell: (info) =>
      cellMinWidth(
        info.row.original.isOverdue
          ? h(FinancialStatus, { status: '逾期', kind: 'danger' })
          : h('span', { class: 'text-caption text-text-muted' }, '—'),
      ),
  }),
  {
    id: 'actions',
    header: '操作',
    meta: { align: 'right' },
    cell: (info) =>
      h('div', { class: 'flex min-w-24 items-center justify-end gap-1 whitespace-nowrap' }, [
        h(
          Button,
          {
            variant: 'ghost',
            size: 'sm',
            'data-testid': 'row-detail',
            onClick: () => router.push(`/business/receivables/${info.row.original.id}`),
          },
          () => '详情',
        ),
        h(
          Button,
          {
            variant: 'ghost',
            size: 'sm',
            class: 'text-brand-foreground',
            'data-testid': 'row-register-payment',
            onClick: () =>
              router.push(
                buildProcessingFeeCreatePath({
                  customerId: info.row.original.customerId,
                  receivableId: info.row.original.id,
                }),
              ),
          },
          () => '登记回款',
        ),
      ]),
  },
]

/* ---------------------------- 创建应收单 ---------------------------- */

const createOpen = ref(false)
</script>

<template>
  <div class="flex flex-col gap-6" data-testid="receivables-page">
    <DemoModeBanner />

    <PageHeader title="应收账款" description="加工费对账应收登记与回款进度跟踪（虚构演示数据）">
      <template #actions>
        <Button variant="primary" data-testid="create-receivable-open" @click="createOpen = true">
          新建应收单
        </Button>
      </template>
    </PageHeader>

    <!-- 顶部财务指标（连续区域；统计范围：全部应收单，不受下方筛选影响） -->
    <section class="rounded-panel border border-border bg-surface p-6" data-testid="receivables-metrics">
      <div class="flex flex-wrap gap-x-12 gap-y-6">
        <FinancialMetric label="累计应收金额" :value="metrics.totalOriginalAmount" caption="Σ 应收单原始金额" />
        <FinancialMetric label="累计已核销金额" :value="metrics.totalPaidAmount" caption="Σ 有效核销金额" />
        <FinancialMetric label="未收余额" :value="metrics.totalOutstandingAmount" caption="Σ 未收金额（当前余额）" />
        <FinancialMetric label="逾期未收余额" :value="metrics.overdueOutstandingAmount" caption="已逾期且未收清合计" />
      </div>
      <p class="mt-4 text-caption text-text-muted">
        统计范围：全部应收单（不受下方筛选影响）· 统计基准日：{{ DEMO_TODAY }}
      </p>
    </section>

    <!-- Tab（回款状态预设 + 逾期独立筛选）与列表 -->
    <Tabs v-model="activeTab" :items="TAB_ITEMS">
      <template v-for="tab in TAB_ITEMS" :key="tab.value" #[tab.value]>
        <div class="flex flex-col gap-4">
          <FilterBar>
            <SearchInput v-model="keyword" placeholder="搜索单据编号或客户…" />
            <Select
              v-model="customerFilter"
              :options="customerOptions"
              class="w-44"
              aria-label="客户筛选"
              data-testid="filter-customer"
            />
            <Select
              v-model="monthFilter"
              :options="monthOptions"
              class="w-36"
              aria-label="所属月份筛选"
              data-testid="filter-month"
            />
            <Select
              v-model="statusFilter"
              :options="statusOptions"
              class="w-36"
              aria-label="回款状态筛选"
              data-testid="filter-status"
            />
            <Select
              v-model="overdueFilter"
              :options="overdueOptions"
              class="w-32"
              aria-label="逾期筛选"
              data-testid="filter-overdue"
            />
            <Button variant="secondary" size="sm" data-testid="filter-clear" @click="clearFilters">
              清空
            </Button>
          </FilterBar>

          <ErrorState
            v-if="loadError"
            title="数据加载失败"
            description="演示数据查询失败，请重试。"
          >
            <template #actions>
              <Button variant="secondary" data-testid="reload-options" @click="loadOptions">重试</Button>
            </template>
          </ErrorState>

          <div v-else data-testid="receivables-table">
            <DataTable
              :columns="columns"
              :data="rows"
              :loading="loading"
              empty-text="暂无符合条件的应收单"
            />
          </div>
        </div>
      </template>
    </Tabs>

    <ReceivableCreateDialog v-model:open="createOpen" />
  </div>
</template>
