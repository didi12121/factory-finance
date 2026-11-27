<script setup lang="ts">
/**
 * 经营概览（Dashboard）—— Phase 0.2 原型。
 *
 * 结构：DemoModeBanner + PageHeader(日期范围 + 新建记录) → 财务概览(指标条)
 *       → 资金图表(收付款趋势 + 支出分类) → 近期动态(近期资金流水 + 待收加工费)。
 *
 * 红线：
 * - 唯一数据源 `usePrototypeStore`（经 useDashboardSummary → getDashboardSummary），
 *   页面不持有财务数据副本、不自行实现统计公式；
 * - 金额 DecimalString，展示用 formatAmount；图表边界才允许 Number 转换；
 * - 日期筛选相对 DEMO_TODAY，真实改变指标与图表；余额类为「当前余额」不因筛选变化；
 * - 状态空/加载/错误使用共享组件（EmptyState/LoadingState/ErrorState）。
 */
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'

import DemoModeBanner from '@/components/shared/DemoModeBanner.vue'
import ErrorState from '@/components/shared/ErrorState.vue'
import LoadingState from '@/components/shared/LoadingState.vue'
import PageHeader from '@/components/shared/PageHeader.vue'
import type { DashboardPeriod } from '@/features/prototype/contracts'
import { RECEIVABLES_ROUTE_PATH } from '@/features/prototype/contracts'
import CashFlowTrendChart from './components/CashFlowTrendChart.vue'
import DateRangeFilter from './components/DateRangeFilter.vue'
import ExpenseBreakdownChart from './components/ExpenseBreakdownChart.vue'
import FinancialOverview from './components/FinancialOverview.vue'
import NewRecordMenu from './components/NewRecordMenu.vue'
import PendingReceivables from './components/PendingReceivables.vue'
import RecentTransactions from './components/RecentTransactions.vue'
import SectionPanel from './components/SectionPanel.vue'
import { useDashboardSummary } from './composables/useDashboardSummary'
import { buildTransactionsPath } from './navigation'
import type { DashboardFilter } from './period'
import { defaultDashboardFilter, resolvePeriod } from './period'

const filter = ref<DashboardFilter>(defaultDashboardFilter())
const period = computed<DashboardPeriod>(() => resolvePeriod(filter.value))
const { summary, loading, error, reload } = useDashboardSummary(period)

const transactionsPath = buildTransactionsPath()
const receivablesPath = RECEIVABLES_ROUTE_PATH

const showSkeleton = computed(() => loading.value && summary.value === null)
</script>

<template>
  <div class="flex flex-col gap-6">
    <DemoModeBanner />

    <PageHeader title="经营概览" description="资金、应收与经营指标一览（虚构演示数据）">
      <template #actions>
        <DateRangeFilter v-model="filter" />
        <NewRecordMenu />
      </template>
    </PageHeader>

    <div v-if="showSkeleton" class="rounded-panel border border-border bg-surface">
      <LoadingState :rows="4" label="经营概览加载中" />
    </div>

    <div v-else-if="error" class="rounded-panel border border-border bg-surface">
      <ErrorState title="经营概览加载失败" :description="error.message">
        <template #actions>
          <button
            type="button"
            class="h-control rounded-control border border-border bg-surface px-4 text-body text-text-primary hover:bg-surface-hover"
            data-testid="dashboard-retry"
            @click="reload"
          >
            重试
          </button>
        </template>
      </ErrorState>
    </div>

    <template v-else-if="summary">
      <!-- Financial Overview -->
      <SectionPanel title="财务概览" description="余额为当前值，期间发生额随筛选变化" flush>
        <FinancialOverview :summary="summary" />
      </SectionPanel>

      <!-- Financial Charts -->
      <section class="flex flex-col gap-4">
        <h2 class="text-section-title font-semibold text-text-primary">资金图表</h2>
        <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <SectionPanel title="收付款趋势" description="按日实际资金收付（内部转账不计入）">
            <CashFlowTrendChart :trend="summary.cashFlowTrend" />
          </SectionPanel>
          <SectionPanel title="支出分类" description="按业务类型聚合实际支出">
            <ExpenseBreakdownChart :breakdown="summary.expenseBreakdown" />
          </SectionPanel>
        </div>
      </section>

      <!-- Recent Activity -->
      <section class="flex flex-col gap-4">
        <h2 class="text-section-title font-semibold text-text-primary">近期动态</h2>
        <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <SectionPanel title="近期资金流水" flush>
            <template #actions>
              <RouterLink
                :to="transactionsPath"
                class="text-table text-brand-foreground hover:underline"
                data-testid="view-all-transactions"
              >
                查看全部 →
              </RouterLink>
            </template>
            <RecentTransactions :transactions="summary.recentTransactions" />
          </SectionPanel>

          <SectionPanel title="待收加工费" flush>
            <template #actions>
              <RouterLink
                :to="receivablesPath"
                class="text-table text-brand-foreground hover:underline"
                data-testid="view-all-receivables"
              >
                查看全部 →
              </RouterLink>
            </template>
            <PendingReceivables :receivables="summary.pendingReceivables" />
          </SectionPanel>
        </div>
      </section>
    </template>
  </div>
</template>
