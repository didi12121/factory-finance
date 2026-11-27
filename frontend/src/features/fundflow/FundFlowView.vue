<script setup lang="ts">
/**
 * 资金流水（真实 API：GET /treasury/transactions）。
 *
 * 数据红线：
 * - 服务端分页 + 筛选（搜索/日期/账户/类型/方向）；金额一律 DecimalString（MoneyText 展示）；
 * - 单条流水金额恒正，收付方向由 direction 表达；账户间内部转账不产生收支；
 * - 只读列表：禁止物理删除流水；撤销走来源业务单据的明确撤销流程
 *   （详情 → 确认对话框 → POST /{contributions|expenses|transfers}/{id}/void）；
 * - 加载失败展示错误并支持重试，禁止回退演示数据。
 */
import { computed, onMounted, ref, watch } from 'vue'

import DocumentNumber from '@/components/finance/DocumentNumber.vue'
import FinancialStatus from '@/components/finance/FinancialStatus.vue'
import MoneyText from '@/components/finance/MoneyText.vue'
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue'
import DataTable from '@/components/shared/DataTable.vue'
import DetailSheet from '@/components/shared/DetailSheet.vue'
import ErrorState from '@/components/shared/ErrorState.vue'
import FilterBar from '@/components/shared/FilterBar.vue'
import LoadingState from '@/components/shared/LoadingState.vue'
import PageHeader from '@/components/shared/PageHeader.vue'
import SearchInput from '@/components/shared/SearchInput.vue'
import Button from '@/components/ui/button/Button.vue'
import { DateRangeInput } from '@/components/ui/date'
import Select from '@/components/ui/select/Select.vue'
import { useToast } from '@/components/ui/toast/useToast'
import { usePagedList } from '@/composables/usePagedList'
import {
  apiErrorMessage,
  masterdataApi,
  TRANSACTION_TYPE_LABELS,
  treasuryApi,
  type FundAccount,
  type FundTransaction,
} from '@/services/api'
import { buildFundflowColumns, type FundflowDisplayRow } from './fundflowColumns'
import {
  ALL,
  buildTransactionDetailModel,
  emptyFundflowFilters,
  hasActiveFundflowFilters,
  isDirectionFilter,
  isTransactionTypeValue,
  resolveTransactionQuery,
  resolveVoidableSource,
  type FundflowFilterState,
  type VoidableSourceDoc,
} from './fundflowModel'

const toast = useToast()

/* ------------------------------ 列表数据加载 ------------------------------ */

const filters = ref<FundflowFilterState>(emptyFundflowFilters())

const list = usePagedList<FundTransaction>(
  (page, size) => {
    const query = resolveTransactionQuery(filters.value, page, size)
    if (query === null) {
      // 筛选条件互相矛盾（结果确定为空）：不发起查询
      return Promise.resolve({ items: [], total: 0, page, size })
    }
    return treasuryApi.listFundTransactions(query)
  },
  '资金流水加载失败，请稍后重试。',
)

onMounted(list.load)
watch(filters, list.reload, { deep: true })

/* -------------------------------- 账户字典 -------------------------------- */

const accounts = ref<FundAccount[]>([])

async function loadAccounts(): Promise<void> {
  try {
    const result = await masterdataApi.listAccounts({ page: 1, size: 500 })
    accounts.value = result.items
  } catch {
    // 账户字典加载失败不阻断流水列表：名称回退显示账户标识
  }
}

onMounted(loadAccounts)

function accountName(accountId: string): string {
  return accounts.value.find((account) => account.id === accountId)?.accountName ?? accountId
}

/* -------------------------------- 筛选条件 -------------------------------- */

const accountOptions = computed(() => [
  { label: '全部资金账户', value: ALL },
  ...accounts.value.map((account) => ({
    label: account.status === 'ENABLED' ? account.accountName : `${account.accountName}（已停用）`,
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

const filtersActive = computed(() => hasActiveFundflowFilters(filters.value))

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
  filters.value = emptyFundflowFilters()
}

/* -------------------------------- 表格列定义 ------------------------------- */

// 展示行：账户名称解析为数据装配（字典晚到时展示行重建 → data 身份变化 → 表格重建）
const displayRows = computed<FundflowDisplayRow[]>(() => {
  const accountNames = new Map(accounts.value.map((account) => [account.id, account.accountName]))
  return list.rows.value.map((row) => ({
    ...row,
    accountName: accountNames.get(row.accountId) ?? row.accountId,
  }))
})

const columns = buildFundflowColumns({
  onOpenDetail: openDetail,
})

/* -------------------------------- 交易详情 -------------------------------- */

const selected = ref<FundTransaction | null>(null)
const sheetOpen = ref(false)

function openDetail(txn: FundTransaction): void {
  selected.value = txn
  sheetOpen.value = true
}

const detailModel = computed(() =>
  selected.value === null
    ? null
    : buildTransactionDetailModel(selected.value, accountName(selected.value.accountId)),
)

const detailTitle = computed(() =>
  selected.value === null ? '资金流水详情' : `资金流水详情 · ${selected.value.transactionNo}`,
)

/* ------------------------------ 来源单据撤销 ------------------------------ */

const voidTarget = ref<VoidableSourceDoc | null>(null)
const voidDialogOpen = ref(false)
const voidSubmitting = ref(false)

function askVoidSource(): void {
  if (selected.value === null) {
    return
  }
  voidTarget.value = resolveVoidableSource(selected.value)
  voidDialogOpen.value = voidTarget.value !== null
}

async function confirmVoidSource(): Promise<void> {
  const target = voidTarget.value
  if (target === null) {
    return
  }
  voidSubmitting.value = true
  try {
    if (target.sourceDocType === 'CONTRIBUTION') {
      await treasuryApi.voidContribution(target.sourceDocId)
    } else if (target.sourceDocType === 'EXPENSE') {
      await treasuryApi.voidExpense(target.sourceDocId)
    } else {
      await treasuryApi.voidTransfer(target.sourceDocId)
    }
    toast.success('撤销成功', `${target.label}已撤销，已生成反向流水。`)
    sheetOpen.value = false
    selected.value = null
    await list.load()
  } catch (error) {
    toast.error('撤销失败', apiErrorMessage(error, '撤销失败，请稍后重试。'))
  } finally {
    voidSubmitting.value = false
    voidTarget.value = null
  }
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <PageHeader
      title="资金流水"
      description="全部资金账户收付流水明细：单条金额恒正、方向由 IN/OUT 表达；账户间内部转账不产生收支。"
    />

    <!-- 筛选工具栏（服务端筛选） -->
    <FilterBar>
      <SearchInput
        :model-value="filters.keyword"
        placeholder="搜索流水编号、交易对手或备注…"
        data-testid="filter-keyword"
        @update:model-value="filters.keyword = $event"
      />

      <div class="flex items-center gap-2">
        <span class="text-caption text-text-muted">交易日期</span>
        <DateRangeInput
          :from="filters.dateFrom"
          :to="filters.dateTo"
          from-aria-label="交易开始日期"
          to-aria-label="交易结束日期"
          @update:from="filters.dateFrom = $event"
          @update:to="filters.dateTo = $event"
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

    <!-- 流水列表（复用共享 DataTable：服务端分页/排序/空/加载状态） -->
    <ErrorState v-if="list.errorText.value !== null" :description="list.errorText.value">
      <template #actions>
        <Button variant="secondary" data-testid="fundflow-retry" @click="list.load">重试</Button>
      </template>
    </ErrorState>
    <div v-else-if="list.loading.value && list.rows.value.length === 0" class="rounded-panel border border-border bg-surface">
      <LoadingState :rows="5" label="资金流水加载中" />
    </div>
    <div v-else data-testid="transactions-table">
      <DataTable
        :columns="columns"
        :data="displayRows"
        :loading="list.loading.value"
        empty-text="暂无符合条件的流水"
        :total="list.total.value"
        manual-pagination
        :page="list.page.value"
        :page-size="list.pageSize.value"
        :page-size-options="[20, 50, 100]"
        @update:page="list.setPage"
        @update:page-size="list.setPageSize"
      />
    </div>

    <!-- 交易详情（全部字段 + 来源单据 + 撤销信息 + 来源单据撤销入口） -->
    <DetailSheet v-model:open="sheetOpen" :title="detailTitle" description="资金事实明细">
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

        <!-- 来源单据撤销（明确撤销流程：保留原单据 + 反向流水 + 防重复撤销） -->
        <section
          v-if="detailModel.voidable !== null"
          class="mt-6 flex flex-col gap-3 rounded-panel border border-border bg-surface p-4"
          data-testid="detail-voidable"
        >
          <h3 class="text-body font-semibold text-text-primary">来源单据操作</h3>
          <p class="text-caption text-text-secondary">
            撤销将保留原单据并生成反向流水，且不可重复撤销。
          </p>
          <div>
            <Button variant="danger" size="sm" data-testid="void-source-button" @click="askVoidSource">
              撤销来源单据
            </Button>
          </div>
        </section>
      </template>

      <template #footer>
        <Button variant="secondary" @click="sheetOpen = false">关闭</Button>
      </template>
    </DetailSheet>

    <!-- 撤销确认 -->
    <ConfirmDialog
      v-model:open="voidDialogOpen"
      title="确认撤销来源单据"
      :description="`撤销后将保留原单据并生成反向流水，且不可重复撤销。当前操作对象：${voidTarget?.label ?? ''}。`"
      confirm-text="确认撤销"
      danger
      data-testid="void-confirm-dialog"
      @confirm="confirmVoidSource"
    />
  </div>
</template>
