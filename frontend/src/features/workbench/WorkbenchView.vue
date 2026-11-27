<script setup lang="ts">
/**
 * 经营概览（真实 API：GET /treasury/dashboard/summary?from&to）。
 *
 * 数据红线：
 * - 指标口径：当前资金余额为「当前余额」；期间股东出资/资金流入/实际支出随日期筛选变化；
 * - 业务与财务分离：股东出资 ≠ 营业收入；资金结余 ≠ 净利润（本页不标注净利润）；
 * - 应收相关区域标注「待开通」，禁止显假数字；
 * - 金额展示 formatAmount（展示层），加载失败展示错误并支持重试，禁止回退演示数据。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'

import CashFlowTrendChart from '@/features/dashboard/components/CashFlowTrendChart.vue'
import ExpenseBreakdownChart from '@/features/dashboard/components/ExpenseBreakdownChart.vue'
import SectionPanel from '@/features/dashboard/components/SectionPanel.vue'
import ErrorState from '@/components/shared/ErrorState.vue'
import LoadingState from '@/components/shared/LoadingState.vue'
import PageHeader from '@/components/shared/PageHeader.vue'
import Button from '@/components/ui/button/Button.vue'
import { DateRangeInput } from '@/components/ui/date'
import FinancialMetric from '@/components/finance/FinancialMetric.vue'
import { apiErrorMessage, treasuryApi, type DashboardSummary } from '@/services/api'
import { todayLocalDate } from '@/utils/localDate'
import {
  buildRecentRowModel,
  buildWorkbenchMetrics,
  defaultPeriodFilter,
  describePeriod,
  PERIOD_PRESET_LABELS,
  resolvePeriod,
  type PeriodFilterState,
  type PeriodPreset,
} from './workbenchModel'

const today = todayLocalDate()
const filter = ref<PeriodFilterState>(defaultPeriodFilter(today))
const period = computed(() => resolvePeriod(filter.value, today))

const summary = ref<DashboardSummary | null>(null)
const loading = ref(false)
const errorText = ref<string | null>(null)

let loadSeq = 0

async function loadSummary(): Promise<void> {
  const seq = ++loadSeq
  loading.value = true
  errorText.value = null
  try {
    const result = await treasuryApi.fetchDashboardSummary(period.value.from, period.value.to)
    if (seq !== loadSeq) {
      return
    }
    summary.value = result
  } catch (error) {
    if (seq !== loadSeq) {
      return
    }
    summary.value = null
    errorText.value = apiErrorMessage(error, '经营概览加载失败，请稍后重试。')
  } finally {
    if (seq === loadSeq) {
      loading.value = false
    }
  }
}

onMounted(loadSummary)
watch(period, loadSummary, { deep: true })

const metrics = computed(() => (summary.value === null ? [] : buildWorkbenchMetrics(summary.value)))
const recentRows = computed(() =>
  summary.value === null ? [] : summary.value.recentTransactions.map(buildRecentRowModel),
)

const presets: PeriodPreset[] = ['thisMonth', 'lastMonth', 'last30Days', 'custom']

function selectPreset(preset: PeriodPreset): void {
  filter.value = { ...filter.value, preset }
}

function updateCustom(field: 'customFrom' | 'customTo', value: string): void {
  filter.value = { ...filter.value, preset: 'custom', [field]: value }
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <PageHeader title="经营概览" description="真实业务数据（资金事实）：统计期间随日期筛选变化。" />

    <!-- 日期范围筛选（本月/上月/最近 30 天/自定义） -->
    <div class="flex flex-wrap items-center gap-2" data-testid="date-range-filter">
      <div
        class="inline-flex h-control items-center rounded-control border border-border bg-surface"
        role="group"
        aria-label="日期范围预设"
      >
        <button
          v-for="preset in presets"
          :key="preset"
          type="button"
          class="h-full rounded-control px-3 text-table transition-colors"
          :class="
            filter.preset === preset
              ? 'bg-brand-subtle text-brand-foreground'
              : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
          "
          :aria-pressed="filter.preset === preset"
          :data-testid="`date-preset-${preset}`"
          @click="selectPreset(preset)"
        >
          {{ PERIOD_PRESET_LABELS[preset] }}
        </button>
      </div>

      <div v-if="filter.preset === 'custom'" class="flex items-center gap-2">
        <span class="text-caption text-text-muted">从</span>
        <DateRangeInput
          :from="filter.customFrom"
          :to="filter.customTo"
          from-test-id="date-custom-from"
          to-test-id="date-custom-to"
          from-aria-label="自定义开始日期"
          to-aria-label="自定义结束日期"
          :hint="false"
          @update:from="updateCustom('customFrom', $event)"
          @update:to="updateCustom('customTo', $event)"
        />
      </div>

      <span class="text-caption text-text-muted tabular" data-testid="date-range-value">
        {{ describePeriod(period) }}
      </span>
    </div>

    <ErrorState v-if="errorText !== null" :description="errorText">
      <template #actions>
        <Button variant="secondary" data-testid="workbench-retry" @click="loadSummary">重试</Button>
      </template>
    </ErrorState>

    <div v-else-if="loading && summary === null" class="rounded-panel border border-border bg-surface">
      <LoadingState :rows="5" label="经营概览加载中" />
    </div>

    <template v-else-if="summary !== null">
      <!-- 资金概览指标（连续区域；应收区域标注待开通，不显假数字） -->
      <SectionPanel title="资金概览" description="余额类为当前余额；期间发生额随筛选变化。" flush>
        <div class="flex flex-col divide-y px-5 xl:flex-row xl:divide-x xl:divide-y-0">
          <div
            v-for="metric in metrics"
            :key="metric.key"
            class="flex-1 py-4 xl:px-4"
            :data-testid="`metric-${metric.key}`"
          >
            <FinancialMetric
              v-if="metric.value !== null"
              :label="metric.label"
              :value="metric.value"
              :caption="metric.caption"
            />
            <div v-else class="flex min-w-[180px] flex-col items-start gap-1">
              <p class="text-caption text-text-muted">{{ metric.label }}</p>
              <p class="text-metric font-semibold text-text-muted" data-testid="metric-pending">待开通</p>
              <p class="text-caption text-text-secondary">{{ metric.caption }}</p>
            </div>
          </div>
        </div>
      </SectionPanel>

      <!-- 图表：资金收付趋势 + 支出分类 -->
      <div class="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <SectionPanel title="资金收付趋势" description="按日聚合的实际资金收付（流入/流出）。">
          <CashFlowTrendChart :trend="summary.cashFlowTrend" />
        </SectionPanel>
        <SectionPanel title="支出分类" description="期间实际支出按分类聚合（资金事实）。">
          <ExpenseBreakdownChart :breakdown="summary.expenseBreakdown" />
        </SectionPanel>
      </div>

      <!-- 近期流水 -->
      <SectionPanel title="近期流水" description="最新资金流水（业务日期倒序）。">
        <ul class="flex flex-col" data-testid="recent-transactions">
          <li v-for="row in recentRows" :key="row.id">
            <RouterLink
              to="/treasury/transactions"
              class="flex items-center gap-3 border-b border-border px-1 py-2.5 transition-colors last:border-b-0 hover:bg-surface-hover"
              data-testid="recent-transaction-row"
            >
              <span class="w-16 shrink-0 text-table tabular text-text-muted">{{ row.dateLabel }}</span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-table text-text-primary">{{ row.typeLabel }}</span>
                <span class="block truncate text-caption text-text-muted">{{ row.subtitle }}</span>
              </span>
              <span class="flex shrink-0 flex-col items-end">
                <span
                  class="amount text-table"
                  :class="row.tone === 'in' ? 'text-success-foreground' : 'text-danger-foreground'"
                  data-testid="recent-transaction-amount"
                >
                  {{ row.signedAmount }}
                </span>
                <span
                  class="text-caption"
                  :class="row.tone === 'in' ? 'text-success-foreground' : 'text-danger-foreground'"
                >
                  {{ row.directionWord }}
                </span>
              </span>
            </RouterLink>
          </li>
          <li v-if="recentRows.length === 0" class="px-1 py-6 text-center text-caption text-text-muted">
            期间内暂无资金流水
          </li>
        </ul>
        <template #footer>
          <RouterLink
            to="/treasury/transactions"
            class="text-table text-brand-foreground hover:underline"
            data-testid="view-all-transactions"
          >
            查看全部资金流水 →
          </RouterLink>
        </template>
      </SectionPanel>
    </template>
  </div>
</template>
