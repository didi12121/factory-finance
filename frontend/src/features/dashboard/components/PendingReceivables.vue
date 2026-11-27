<script setup lang="ts">
/**
 * 待收加工费（未结清应收，只读展示）。
 * - 未收金额 = 原始应收 − 已核销（由核销明细派生，DashboardSummary 提供）；
 * - 回款状态与逾期为独立派生属性（文字 + 语义色表达，不只靠颜色）；
 * - 点击任一单据 → 应收单详情（/business/receivables/:id）；
 * - 展示层 limit：桌面 ≤ 8 条、移动端进一步降低（不截断/改写 Store 数据），
 *   顺序沿用 domain 紧迫度排序（compareReceivableUrgency 语义）。
 */
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

import Badge from '@/components/ui/badge/Badge.vue'
import DocumentNumber from '@/components/finance/DocumentNumber.vue'
import FinancialStatus from '@/components/finance/FinancialStatus.vue'
import MoneyText from '@/components/finance/MoneyText.vue'
import type { ReceivableView } from '@/features/prototype/contracts'
import { usePrototypeStore } from '@/features/prototype/stores/prototype'
import { useDashboardListLimit } from '../listLimit'
import { buildReceivableDetailPath } from '../navigation'

const props = defineProps<{ receivables: ReceivableView[] }>()

const store = usePrototypeStore()
const listLimit = useDashboardListLimit()

/** 展示层截取（保持紧迫度优先顺序） */
const visibleReceivables = computed(() => props.receivables.slice(0, listLimit.value))

function customerName(customerId: string): string {
  return store.customerById(customerId)?.name ?? '—'
}

function statusText(view: ReceivableView): string {
  return view.summary.status === 'UNPAID' ? '未收' : '部分回款'
}

function statusKind(view: ReceivableView): 'warning' | 'brand' {
  return view.summary.status === 'UNPAID' ? 'warning' : 'brand'
}

function dueText(view: ReceivableView): string {
  return view.receivable.dueDate ? `到期 ${view.receivable.dueDate}` : '未约定到期'
}
</script>

<template>
  <ul class="flex flex-col" data-testid="pending-receivables">
    <li v-for="view in visibleReceivables" :key="view.receivable.id">
      <RouterLink
        :to="buildReceivableDetailPath(view.receivable.id)"
        class="flex items-center gap-3 border-b border-border px-4 py-2.5 transition-colors last:border-b-0 hover:bg-surface-hover sm:px-5 sm:py-3"
        data-testid="pending-receivable-row"
      >
        <span class="flex min-w-0 flex-1 flex-col">
          <DocumentNumber :value="view.receivable.statementNo" link />
          <span class="truncate text-caption text-text-muted">{{ customerName(view.receivable.customerId) }}</span>
        </span>

        <span class="hidden w-28 shrink-0 text-caption tabular text-text-muted sm:block">
          {{ dueText(view) }}
        </span>

        <span class="flex shrink-0 flex-col items-end gap-1">
          <MoneyText :value="view.summary.outstandingAmount" size="body" align="right" data-testid="pending-outstanding" />
          <span class="flex items-center gap-1">
            <FinancialStatus :status="statusText(view)" :kind="statusKind(view)" />
            <Badge v-if="view.summary.isOverdue" variant="danger">逾期</Badge>
          </span>
        </span>
      </RouterLink>
    </li>
  </ul>
</template>
