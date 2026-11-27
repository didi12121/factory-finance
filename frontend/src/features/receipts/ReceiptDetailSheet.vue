<script setup lang="ts">
/**
 * 收款单详情（DetailSheet）：收款单 + 核销明细 + 关联资金流入流水。
 * 数据只经 usePrototypeStore 读取（单一数据源）；金额一律 MoneyText 展示。
 */
import { computed } from 'vue'

import DocumentNumber from '@/components/finance/DocumentNumber.vue'
import FinancialStatus from '@/components/finance/FinancialStatus.vue'
import MoneyText from '@/components/finance/MoneyText.vue'
import Table from '@/components/ui/table/Table.vue'
import TableBody from '@/components/ui/table/TableBody.vue'
import TableCell from '@/components/ui/table/TableCell.vue'
import TableHead from '@/components/ui/table/TableHead.vue'
import TableHeader from '@/components/ui/table/TableHeader.vue'
import TableRow from '@/components/ui/table/TableRow.vue'
import DetailSheet from '@/components/shared/DetailSheet.vue'
import EmptyState from '@/components/shared/EmptyState.vue'
import { formatOperationDateTime } from '@/components/ui/date'
import type { EntityId, ReceiptDetail } from '@/features/prototype/contracts'
import { sumAmounts } from '@/features/prototype/domain/amounts'
import { usePrototypeStore } from '@/features/prototype/stores/prototype'
import { buildReceiptRowViews } from './receiptModel'

const props = defineProps<{
  open: boolean
  /** 当前查看的收款单详情（null 时不渲染内容） */
  detail: ReceiptDetail | null
}>()

const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const store = usePrototypeStore()

const rowView = computed(() => {
  const current = props.detail
  if (current === null) {
    return null
  }
  return (
    buildReceiptRowViews([current.receipt], store.receiptAllocations, store.customers, store.fundAccounts)[0] ?? null
  )
})

const transactionNo = computed(() => {
  const current = props.detail
  if (current === null) {
    return '—'
  }
  return store.fundTransactions.find((item) => item.id === current.receipt.fundTransactionId)?.transactionNo ?? '—'
})

const allocatedTotal = computed(() => {
  const current = props.detail
  if (current === null) {
    return '0.00'
  }
  return sumAmounts(current.allocations.map((item) => item.allocationAmount))
})

function statementNoOf(receivableId: EntityId): string {
  return store.receivables.find((item) => item.id === receivableId)?.statementNo ?? receivableId
}
</script>

<template>
  <DetailSheet
    :open="props.open"
    title="收款单详情"
    description="一笔实际收款只记一次资金流入；核销明细不产生新的资金流水。"
    @update:open="emit('update:open', $event)"
  >
    <div v-if="props.detail !== null && rowView !== null" class="flex flex-col gap-5">
      <dl class="grid grid-cols-2 gap-x-4 gap-y-2">
        <div class="flex items-center justify-between gap-2">
          <dt class="text-caption text-text-muted">收款单编号</dt>
          <dd><DocumentNumber :value="props.detail.receipt.receiptNo" /></dd>
        </div>
        <div class="flex items-center justify-between gap-2">
          <dt class="text-caption text-text-muted">客户</dt>
          <dd class="text-table text-text-primary">{{ rowView.customerName }}</dd>
        </div>
        <div class="flex items-center justify-between gap-2">
          <dt class="text-caption text-text-muted">收款日期</dt>
          <dd class="text-table text-text-primary">{{ props.detail.receipt.receiptDate }}</dd>
        </div>
        <div class="flex items-center justify-between gap-2">
          <dt class="text-caption text-text-muted">收款账户</dt>
          <dd class="text-table text-text-primary">{{ rowView.accountName }}</dd>
        </div>
        <div class="flex items-center justify-between gap-2">
          <dt class="text-caption text-text-muted">实际收款金额</dt>
          <dd><MoneyText :value="props.detail.receipt.actualAmount" size="table" align="left" /></dd>
        </div>
        <div class="flex items-center justify-between gap-2">
          <dt class="text-caption text-text-muted">已核销金额</dt>
          <dd><MoneyText :value="allocatedTotal" size="table" align="left" /></dd>
        </div>
        <div class="flex items-center justify-between gap-2">
          <dt class="text-caption text-text-muted">未分配金额</dt>
          <dd><MoneyText :value="rowView.unallocatedAmount" size="table" align="left" /></dd>
        </div>
        <div class="flex items-center justify-between gap-2">
          <dt class="text-caption text-text-muted">核销状态</dt>
          <dd><FinancialStatus :status="rowView.statusLabel" :kind="rowView.statusKind" /></dd>
        </div>
        <div class="flex items-center justify-between gap-2">
          <dt class="text-caption text-text-muted">外部流水参考号</dt>
          <dd class="text-table text-text-primary">{{ props.detail.receipt.externalRef ?? '—' }}</dd>
        </div>
        <div class="flex items-center justify-between gap-2">
          <dt class="text-caption text-text-muted">资金流入流水</dt>
          <dd><DocumentNumber :value="transactionNo" /></dd>
        </div>
        <div class="flex items-center justify-between gap-2">
          <dt class="text-caption text-text-muted">备注</dt>
          <dd class="text-table text-text-primary">{{ props.detail.receipt.remark ?? '—' }}</dd>
        </div>
      </dl>

      <div class="flex flex-col gap-2">
        <h3 class="text-body font-medium text-text-primary">核销明细（{{ props.detail.allocations.length }} 笔）</h3>
        <EmptyState
          v-if="props.detail.allocations.length === 0"
          title="暂无核销明细"
          description="本收款单尚未核销任何应收单。"
        />
        <Table v-else>
          <TableHeader>
            <TableRow>
              <TableHead>对账单编号</TableHead>
              <TableHead align="right">核销金额</TableHead>
              <TableHead>核销时间</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="item in props.detail.allocations" :key="item.id">
              <TableCell><DocumentNumber :value="statementNoOf(item.receivableId)" /></TableCell>
              <TableCell align="right"><MoneyText :value="item.allocationAmount" size="table" /></TableCell>
              <TableCell class="tabular">{{ formatOperationDateTime(item.allocatedAt) }}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  </DetailSheet>
</template>
