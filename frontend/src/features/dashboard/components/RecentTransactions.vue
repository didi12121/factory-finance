<script setup lang="ts">
/**
 * 近期资金流水（只读展示）。
 * - 金额展示遵循 DESIGN_SYSTEM 金额规范（formatAmount 千分位/两位小数 + tabular）；
 * - 方向以「文字 + 语义色」表达（流入/流出），不只靠颜色区分；
 * - 点击任一资金流水 → 资金流水列表；
 * - 展示层 limit：桌面 ≤ 8 条、移动端进一步降低（不截断/改写 Store 数据，
 *   顺序沿用 Store 的业务日期倒序）。
 */
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

import type { FundTransaction } from '@/features/prototype/contracts'
import { TRANSACTION_TYPE_LABELS } from '../chartData'
import { useDashboardListLimit } from '../listLimit'
import { buildTransactionsPath } from '../navigation'
import { formatAmount } from '@/utils/money'

const props = defineProps<{ transactions: FundTransaction[] }>()

const transactionsPath = buildTransactionsPath()
const listLimit = useDashboardListLimit()

/** 展示层截取（保持业务日期倒序） */
const visibleTransactions = computed(() => props.transactions.slice(0, listLimit.value))

function directionWord(txn: FundTransaction): string {
  return txn.direction === 'IN' ? '流入' : '流出'
}

function directionClass(txn: FundTransaction): string {
  return txn.direction === 'IN' ? 'text-success-foreground' : 'text-danger-foreground'
}

function signedAmount(txn: FundTransaction): string {
  const sign = txn.direction === 'IN' ? '+' : '−'
  return `${sign}${formatAmount(txn.amount)}`
}

function subtitle(txn: FundTransaction): string {
  return txn.counterparty ?? TRANSACTION_TYPE_LABELS[txn.transactionType] ?? ''
}
</script>

<template>
  <ul class="flex flex-col" data-testid="recent-transactions">
    <li v-for="txn in visibleTransactions" :key="txn.id">
      <RouterLink
        :to="transactionsPath"
        class="flex items-center gap-3 border-b border-border px-4 py-2.5 transition-colors last:border-b-0 hover:bg-surface-hover sm:px-5 sm:py-3"
        data-testid="recent-transaction-row"
      >
        <span class="w-16 shrink-0 text-table tabular text-text-muted">{{ txn.tradeDate.slice(5) }}</span>
        <span class="min-w-0 flex-1">
          <span class="block truncate text-table text-text-primary">
            {{ TRANSACTION_TYPE_LABELS[txn.transactionType] ?? txn.transactionType }}
          </span>
          <span class="block truncate text-caption text-text-muted">{{ subtitle(txn) }}</span>
        </span>
        <span class="flex shrink-0 flex-col items-end">
          <span class="amount text-table" :class="directionClass(txn)" data-testid="recent-transaction-amount">
            {{ signedAmount(txn) }}
          </span>
          <span class="text-caption" :class="directionClass(txn)">{{ directionWord(txn) }}</span>
        </span>
      </RouterLink>
    </li>
  </ul>
</template>
