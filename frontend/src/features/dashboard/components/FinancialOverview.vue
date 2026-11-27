<script setup lang="ts">
/**
 * 经营概览 —— 财务概览指标条（连续区域 + 分隔线，禁止每指标一张大卡片）。
 *
 * 指标口径（DashboardSummary 契约）：
 * - 余额类（当前资金余额/当前应收余额）为「当前余额」，不因期间筛选变成期间发生额；
 * - 期间发生额（加工收入/实际回款/实际支出）随日期筛选变化；
 * - 业务与财务分离：加工收入(权责) ≠ 实际回款(资金)，资金结余 ≠ 净利润。
 *
 * 导航：点击「当前应收余额」→ 应收列表。
 */
import { RouterLink } from 'vue-router'

import FinancialMetric from '@/components/finance/FinancialMetric.vue'
import type { DashboardSummary } from '@/features/prototype/contracts'
import { RECEIVABLES_ROUTE_PATH } from '@/features/prototype/contracts'
import { formatAmount } from '@/utils/money'

const props = defineProps<{ summary: DashboardSummary }>()

function overdueCaption(): string {
  return `未收合计 · 逾期 ${formatAmount(props.summary.overdueReceivableOutstanding)}`
}
</script>

<template>
  <div class="flex flex-col divide-y xl:flex-row xl:divide-x xl:divide-y-0">
    <div class="flex-1 px-2 py-4" data-testid="metric-fund-balance">
      <FinancialMetric
        label="当前资金余额"
        :value="props.summary.totalFundBalance"
        caption="资金结余 · 非净利润"
      />
    </div>

    <RouterLink
      :to="RECEIVABLES_ROUTE_PATH"
      class="group flex flex-1 flex-col items-start px-2 py-4 transition-colors hover:bg-surface-hover"
      data-testid="metric-receivables-link"
      aria-label="当前应收余额，查看应收账款"
    >
      <FinancialMetric label="当前应收余额" :value="props.summary.totalReceivableOutstanding">
        <template #extra>
          <p class="text-caption text-text-secondary">{{ overdueCaption() }}</p>
          <p class="mt-1 text-caption text-brand-foreground group-hover:underline">查看应收 →</p>
        </template>
      </FinancialMetric>
    </RouterLink>

    <div class="flex-1 px-2 py-4" data-testid="metric-income">
      <FinancialMetric
        label="期间加工收入"
        :value="props.summary.periodProcessingFeeIncome"
        caption="权责发生制 · 按会计期间"
      />
    </div>

    <div class="flex-1 px-2 py-4" data-testid="metric-receipts">
      <FinancialMetric
        label="期间实际回款"
        :value="props.summary.periodActualReceipts"
        caption="资金事实 · 按到账日"
      />
    </div>

    <div class="flex-1 px-2 py-4" data-testid="metric-expenses">
      <FinancialMetric
        label="期间实际支出"
        :value="props.summary.periodActualExpenses"
        caption="资金事实 · 按发生日"
      />
    </div>
  </div>
</template>
