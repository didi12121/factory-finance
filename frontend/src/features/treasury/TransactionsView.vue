<script setup lang="ts">
/**
 * 资金流水列表与交易详情（Agent E / P02-E，完整替换 Gate 2 stub）。
 *
 * 数据红线：
 * - 唯一数据源 `usePrototypeStore`（虚构演示数据，不请求后端、不持久化）；
 * - 金额一律 DecimalString；汇总走 utils/decimal 精确运算（净流入 = subtractAmounts），
 *   金额列排序走 compareAmounts（amountSortingFn），禁止 Number/parseFloat 参与财务运算；
 * - 单条流水金额恒正，收付方向由 direction 表达；业务类型 ≠ 收入概念
 *   （加工费回款 IN ≠ 营业收入；股东出资 IN ≠ 营业收入；内部转账 ≠ 收支）；
 * - 汇总口径显式：筛选单账户按该账户真实 IN/OUT；工厂整体外部收付排除内部转账重复影响。
 *
 * 交互红线：
 * - 只读列表：禁止物理删除已确认流水（不提供删除入口），不提供假新增按钮；
 * - 跨页跳转只用冻结导航契约（contracts/navigation：buildProcessingFeeCreatePath /
 *   RECEIVABLES_ROUTE_PATH），禁止手拼路径字符串；
 * - 详情支持内部转账成对流水查看（transferGroupId 派对，账户间划转不产生收支）。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import Button from '@/components/ui/button/Button.vue'
import Select from '@/components/ui/select/Select.vue'
import DemoModeBanner from '@/components/shared/DemoModeBanner.vue'
import DetailSheet from '@/components/shared/DetailSheet.vue'
import DataTable from '@/components/shared/DataTable.vue'
import ErrorState from '@/components/shared/ErrorState.vue'
import FilterBar from '@/components/shared/FilterBar.vue'
import LoadingState from '@/components/shared/LoadingState.vue'
import PageHeader from '@/components/shared/PageHeader.vue'
import SearchInput from '@/components/shared/SearchInput.vue'
import DocumentNumber from '@/components/finance/DocumentNumber.vue'
import FinancialMetric from '@/components/finance/FinancialMetric.vue'
import FinancialStatus from '@/components/finance/FinancialStatus.vue'
import MoneyText from '@/components/finance/MoneyText.vue'
import { buildProcessingFeeCreatePath, RECEIVABLES_ROUTE_PATH } from '@/features/prototype/contracts'
import type { FundTransaction } from '@/features/prototype/contracts'
import { usePrototypeStore } from '@/features/prototype/stores/prototype'
import { buildTransactionColumns } from './transactionsColumns'
import {
  ALL,
  buildTransactionDetailModel,
  businessErrorMessage,
  computeTransactionSummary,
  directionLabel,
  emptyFilterState,
  hasActiveFilters,
  isDirectionFilter,
  isTransactionTypeValue,
  resolveTransactionQuery,
  TRANSACTION_TYPE_LABELS,
  type TransactionDetailContext,
  type TransactionDetailModel,
  type TransactionSummary,
  type TransactionsFilterState,
} from './transactionsModel'

const store = usePrototypeStore()
const router = useRouter()

/* ------------------------------ 列表数据加载 ------------------------------ */

const filters = ref<TransactionsFilterState>(emptyFilterState())
const rows = ref<FundTransaction[]>([])
const loading = ref(false)
const errorText = ref<string | null>(null)

/** 连续筛选变更的竞态保护（仅采纳最后一次查询结果） */
let loadSeq = 0

async function loadTransactions(): Promise<void> {
  const seq = ++loadSeq
  loading.value = true
  errorText.value = null
  try {
    const query = resolveTransactionQuery(filters.value)
    const items =
      query === null ? [] : (await store.listFundTransactions(query)).items
    if (seq !== loadSeq) {
      return
    }
    rows.value = items
  } catch (error) {
    if (seq !== loadSeq) {
      return
    }
    rows.value = []
    errorText.value = businessErrorMessage(error, '资金流水加载失败，请稍后重试。')
  } finally {
    if (seq === loadSeq) {
      loading.value = false
    }
  }
}

onMounted(loadTransactions)
watch(filters, loadTransactions, { deep: true })

/* -------------------------------- 筛选条件 -------------------------------- */

const accountOptions = computed(() => [
  { label: '全部资金账户', value: ALL },
  ...store.fundAccounts.map((account) => ({
    label: account.enabled ? account.name : `${account.name}（已停用）`,
    value: account.id,
  })),
])

const typeOptions = computed(() => [
  { label: '全部业务类型', value: ALL },
  ...Object.entries(TRANSACTION_TYPE_LABELS).map(([value, label]) => ({ label, value })),
])

const directionOptions = [
  { label: '全部方向', value: ALL },
  { label: '流入（IN）', value: 'IN' },
  { label: '流出（OUT）', value: 'OUT' },
  { label: '内部转账', value: 'TRANSFER' },
]

const filtersActive = computed(() => hasActiveFilters(filters.value))

function setAccountId(value: string): void {
  filters.value.accountId = value
}

function setTransactionType(value: string): void {
  if (isTransactionTypeValue(value)) {
    filters.value.transactionType = value
  }
}

function setDirection(value: string): void {
  if (isDirectionFilter(value)) {
    filters.value.direction = value
  }
}

function clearFilters(): void {
  filters.value = emptyFilterState()
}

/* -------------------------------- 资金汇总 -------------------------------- */

const summary = computed<TransactionSummary>(() => {
  const accountName =
    filters.value.accountId === ALL
      ? null
      : (store.accountById(filters.value.accountId)?.name ?? null)
  return computeTransactionSummary(rows.value, accountName)
})

/* -------------------------------- 表格列定义 ------------------------------- */

const columns = buildTransactionColumns({
  accountName: (accountId) => store.accountById(accountId)?.name ?? '—',
  receiptNoById: (receiptId) => store.receiptDetailById(receiptId)?.receipt.receiptNo ?? null,
  onOpenDetail: openDetail,
})

/* -------------------------------- 交易详情 -------------------------------- */

const selected = ref<FundTransaction | null>(null)
const sheetOpen = ref(false)

function openDetail(txn: FundTransaction): void {
  selected.value = txn
  sheetOpen.value = true
}

const detailContext: TransactionDetailContext = {
  accountName: (accountId) => store.accountById(accountId)?.name ?? null,
  customerName: (customerId) => store.customerById(customerId)?.name ?? null,
  receiptDetailById: (receiptId) => store.receiptDetailById(receiptId),
  receivableViewById: (receivableId) => store.receivableViewById(receivableId),
}

const detailModel = computed<TransactionDetailModel | null>(() =>
  selected.value === null
    ? null
    : buildTransactionDetailModel(selected.value, detailContext, store.fundTransactions),
)

const detailTitle = computed(() =>
  selected.value === null ? '资金流水详情' : `资金流水详情 · ${selected.value.transactionNo}`,
)

const accountLabel = (accountId: string): string => store.accountById(accountId)?.name ?? '—'

/** 详情内切换到内部转账关联流水（transferGroupId 派对的另一方向账户流水） */
function viewTransferPartner(txn: FundTransaction): void {
  selected.value = txn
}

/**
 * 跳收款单（加工费回款流水的来源单据回溯）。
 * 跨页只用冻结导航契约，禁止手拼路径。
 */
function viewSourceReceipt(): void {
  void router.push(buildProcessingFeeCreatePath())
}

/** 查看相关应收（收款单核销去向）；跨页只用冻结导航契约 */
function viewRelatedReceivables(): void {
  void router.push(RECEIVABLES_ROUTE_PATH)
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <DemoModeBanner />

    <PageHeader
      title="资金流水"
      description="全部资金账户收付流水明细（虚构演示数据）：单条金额恒正、方向由 IN/OUT 表达；账户间内部转账不产生收支。"
    />

    <!-- 资金汇总（筛选范围口径，显式统计范围文案） -->
    <section class="rounded-panel border border-border bg-surface p-5" data-testid="transactions-summary">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h2 class="text-section-title font-semibold text-text-primary">资金汇总</h2>
        <p class="text-caption text-text-muted" data-testid="summary-scope">{{ summary.scopeText }}</p>
      </div>
      <div class="mt-4 flex flex-wrap gap-x-12 gap-y-4">
        <FinancialMetric label="资金流入" :value="summary.inflow" />
        <FinancialMetric label="资金流出" :value="summary.outflow" />
        <FinancialMetric label="净流入" :value="summary.net" />
      </div>
      <p class="mt-3 text-caption text-text-secondary" data-testid="summary-count">
        {{ summary.countText }}
      </p>
      <p class="mt-1 text-caption text-text-muted">
        资金流入/流出为实际资金收付事实（营业收入 ≠ 实际收款；经营费用 ≠ 实际付款；股东出资 ≠ 营业收入；账户间转账 ≠ 收支）。
      </p>
    </section>

    <!-- 筛选工具栏（全部真实过滤） -->
    <FilterBar>
      <SearchInput
        :model-value="filters.keyword"
        placeholder="搜索流水编号、交易对手或备注…"
        @update:model-value="filters.keyword = $event"
      />

      <div class="flex items-center gap-2">
        <span class="text-caption text-text-muted">交易日期</span>
        <input
          v-model="filters.dateFrom"
          type="date"
          class="h-control rounded-control border border-border bg-surface px-3 text-body text-text-primary focus-visible:border-brand"
          aria-label="交易开始日期"
        />
        <span class="text-caption text-text-muted">至</span>
        <input
          v-model="filters.dateTo"
          type="date"
          class="h-control rounded-control border border-border bg-surface px-3 text-body text-text-primary focus-visible:border-brand"
          aria-label="交易结束日期"
        />
      </div>

      <div data-testid="filter-account" class="w-44">
        <Select
          :model-value="filters.accountId"
          :options="accountOptions"
          aria-label="资金账户"
          @update:model-value="setAccountId"
        />
      </div>

      <div data-testid="filter-type" class="w-40">
        <Select
          :model-value="filters.transactionType"
          :options="typeOptions"
          aria-label="业务类型"
          @update:model-value="setTransactionType"
        />
      </div>

      <div data-testid="filter-direction" class="w-36">
        <Select
          :model-value="filters.direction"
          :options="directionOptions"
          aria-label="流水方向"
          @update:model-value="setDirection"
        />
      </div>

      <Button
        variant="secondary"
        size="sm"
        data-testid="clear-filters"
        :disabled="!filtersActive"
        @click="clearFilters"
      >
        清空筛选
      </Button>
    </FilterBar>

    <!-- 流水列表（复用共享 DataTable：排序/分页/空/加载状态） -->
    <ErrorState v-if="errorText !== null" :description="errorText">
      <template #actions>
        <Button variant="secondary" @click="loadTransactions">重试</Button>
      </template>
    </ErrorState>
    <div v-else-if="loading && rows.length === 0" class="rounded-panel border border-border bg-surface">
      <LoadingState :rows="5" label="资金流水加载中" />
    </div>
    <div v-else data-testid="transactions-table">
      <DataTable
        :columns="columns"
        :data="rows"
        :loading="loading"
        empty-text="暂无符合条件的流水"
        :page-size="20"
        :page-size-options="[20, 50, 100]"
      />
    </div>

    <!-- 交易详情（全部字段 + 备注 + 关联流水 + 来源单据回溯） -->
    <DetailSheet v-model:open="sheetOpen" :title="detailTitle" description="虚构演示数据（页面刷新恢复初始状态）">
      <template v-if="detailModel !== null">
        <dl class="flex flex-col gap-3">
          <div
            v-for="row in detailModel.rows"
            :key="row.key"
            class="flex items-start justify-between gap-4"
          >
            <dt class="shrink-0 text-caption text-text-muted">{{ row.label }}</dt>
            <dd class="min-w-0 text-right">
              <DocumentNumber v-if="row.kind === 'docNo'" :value="row.value" />
              <MoneyText v-else-if="row.kind === 'money'" :value="row.value" />
              <FinancialStatus
                v-else-if="row.kind === 'status'"
                :status="row.value"
                :kind="row.tone ?? 'default'"
              />
              <span
                v-else
                class="text-body text-text-primary"
                :class="row.kind === 'date' ? 'tabular' : ''"
              >
                {{ row.value }}
              </span>
            </dd>
          </div>
        </dl>

        <!-- 来源收款单回溯（加工费回款流水可跳收款单） -->
        <section
          v-if="detailModel.receipt !== null"
          class="mt-6 flex flex-col gap-3 rounded-panel border border-border bg-surface p-4"
          data-testid="detail-receipt"
        >
          <h3 class="text-body font-semibold text-text-primary">来源收款单</h3>
          <p class="flex flex-wrap items-center gap-1 text-table text-text-secondary">
            <span>收款单</span>
            <DocumentNumber :value="detailModel.receipt.receiptNo" />
            <span>· 客户 {{ detailModel.receipt.customerName }} · 金额</span>
            <MoneyText :value="detailModel.receipt.actualAmount" size="table" align="left" />
          </p>
          <ul v-if="detailModel.receipt.allocations.length > 0" class="flex flex-col gap-1">
            <li
              v-for="allocation in detailModel.receipt.allocations"
              :key="allocation.receivableId"
              class="flex flex-wrap items-center gap-1 text-caption text-text-secondary"
            >
              <span>核销应收</span>
              <DocumentNumber :value="allocation.statementNo" />
              <MoneyText :value="allocation.allocationAmount" size="table" align="left" />
            </li>
          </ul>
          <div class="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" data-testid="view-source-receipt" @click="viewSourceReceipt">
              查看收款单
            </Button>
            <Button variant="secondary" size="sm" data-testid="view-related-receivables" @click="viewRelatedReceivables">
              查看相关应收
            </Button>
          </div>
        </section>

        <!-- 关联流水（内部转账成对流水：transferGroupId 派对） -->
        <section class="mt-6 flex flex-col gap-3" data-testid="detail-related">
          <h3 class="text-body font-semibold text-text-primary">关联流水</h3>
          <template v-if="detailModel.transferPartners.length > 0">
            <div
              v-for="partner in detailModel.transferPartners"
              :key="partner.id"
              class="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-border bg-surface p-3"
            >
              <div class="flex flex-wrap items-center gap-3 text-table text-text-secondary">
                <DocumentNumber :value="partner.transactionNo" />
                <span>{{ accountLabel(partner.accountId) }}</span>
                <span>{{ directionLabel(partner.direction) }}</span>
                <MoneyText :value="partner.amount" size="table" />
              </div>
              <Button variant="ghost" size="sm" @click="viewTransferPartner(partner)">查看该流水</Button>
            </div>
            <p class="text-caption text-text-muted">
              内部转账成对流水（同 transferGroupId）：账户间划转不产生收支，整体资金净变化为 0。
            </p>
          </template>
          <p v-else class="text-caption text-text-muted">该流水无关联流水。</p>
        </section>
      </template>

      <template #footer>
        <Button variant="secondary" @click="sheetOpen = false">关闭</Button>
      </template>
    </DetailSheet>
  </div>
</template>
