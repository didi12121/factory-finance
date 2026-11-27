<script setup lang="ts">
/**
 * 应收单详情页 —— Agent F（P02-F）。
 *
 * 红线：
 * - 唯一数据源 `usePrototypeStore`：应收/已收/未收/回款状态/逾期全部读取 store 派生值，
 *   页面禁止自算余额副本；金额展示走 MoneyText（formatAmount）；
 * - 回款记录**区分「收款单实际总额」与「本单核销金额」**：一笔收款可能核销多张应收单，
 *   禁止把收款单实际总额当作本单已收展示；本单已收 = Σ 本单核销金额；
 * - 「登记回款」只经冻结契约 `buildProcessingFeeCreatePath()` 进入加工费回款页（Agent G），
 *   禁止自建回款表单/核销引擎；
 * - 无效 ID：明确「未找到」状态 + 返回列表入口，不空白、不伪造单据。
 */

import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import Button from '@/components/ui/button/Button.vue'
import Table from '@/components/ui/table/Table.vue'
import TableBody from '@/components/ui/table/TableBody.vue'
import TableCell from '@/components/ui/table/TableCell.vue'
import TableHead from '@/components/ui/table/TableHead.vue'
import TableHeader from '@/components/ui/table/TableHeader.vue'
import TableRow from '@/components/ui/table/TableRow.vue'
import DocumentNumber from '@/components/finance/DocumentNumber.vue'
import FinancialMetric from '@/components/finance/FinancialMetric.vue'
import FinancialStatus from '@/components/finance/FinancialStatus.vue'
import MoneyText from '@/components/finance/MoneyText.vue'
import DemoModeBanner from '@/components/shared/DemoModeBanner.vue'
import EmptyState from '@/components/shared/EmptyState.vue'
import PageHeader from '@/components/shared/PageHeader.vue'
import {
  RECEIVABLES_ROUTE_PATH,
  buildProcessingFeeCreatePath,
} from '@/features/prototype/contracts'
import { usePrototypeStore } from '@/features/prototype/stores/prototype'
import {
  buildReceivableAllocationRows,
  buildReceivableAuditEntries,
  buildReceivableReceiptRows,
} from './receivableDetail'
import { STATUS_LABELS, statusKind } from './receivableList'

const route = useRoute()
const router = useRouter()
const store = usePrototypeStore()

const receivableId = computed(() => String(route.params.id ?? ''))

/** 应收组合视图（store 派生：已收/未收/状态/逾期由核销明细派生） */
const view = computed(() => store.receivableViewById(receivableId.value))
const customerName = computed(() => {
  if (view.value === null) {
    return ''
  }
  return store.customerById(view.value.receivable.customerId)?.name ?? view.value.receivable.customerId
})

/** 回款记录（收款单实际总额 vs 本单核销金额，两个独立金额） */
const receiptRows = computed(() =>
  view.value === null
    ? []
    : buildReceivableReceiptRows(view.value.receivable.id, store.receiptAllocations, store.receipts),
)

/** 核销明细（逐笔） */
const allocationRows = computed(() =>
  view.value === null
    ? []
    : buildReceivableAllocationRows(view.value.receivable.id, store.receiptAllocations, store.receipts),
)

/** 操作历史（创建 + 核销事件，来自既有审计字段） */
const auditEntries = computed(() =>
  view.value === null
    ? []
    : buildReceivableAuditEntries(
        { createdAt: view.value.receivable.createdAt },
        view.value.receivable.id,
        store.receiptAllocations,
        store.receipts,
      ),
)

function accountNameOf(accountId: string): string {
  return store.accountById(accountId)?.name ?? accountId
}

function goBack(): void {
  void router.push(RECEIVABLES_ROUTE_PATH)
}

/** 回款入口（冻结契约：action → customerId → receivableId） */
function goRegisterPayment(): void {
  if (view.value === null) {
    return
  }
  void router.push(
    buildProcessingFeeCreatePath({
      customerId: view.value.receivable.customerId,
      receivableId: view.value.receivable.id,
    }),
  )
}
</script>

<template>
  <div class="flex flex-col gap-6" data-testid="receivable-detail-page">
    <DemoModeBanner />

    <PageHeader title="应收单详情" description="应收单据、回款记录与核销明细（虚构演示数据）">
      <template #actions>
        <Button variant="secondary" data-testid="back-to-list" @click="goBack">返回列表</Button>
        <Button
          v-if="view !== null"
          variant="primary"
          data-testid="register-payment"
          @click="goRegisterPayment"
        >
          登记回款
        </Button>
      </template>
    </PageHeader>

    <!-- 无效 ID：明确未找到状态 + 返回列表（不空白、不造假单） -->
    <div v-if="view === null" class="rounded-panel border border-border bg-surface">
      <EmptyState
        title="未找到该应收单"
        :description="`内部标识 ${receivableId} 对应的应收单不存在，可能尚未创建或已被移除。`"
      >
        <template #actions>
          <Button variant="primary" data-testid="not-found-back" @click="goBack">返回应收账款列表</Button>
        </template>
      </EmptyState>
    </div>

    <template v-else>
      <!-- 顶部：编号/客户/月份/状态/逾期 + 应收/已收/未收金额 -->
      <section class="rounded-panel border border-border bg-surface p-6" data-testid="detail-summary">
        <div class="flex flex-wrap items-start justify-between gap-6">
          <div class="flex flex-col gap-2">
            <div class="flex items-center gap-2">
              <DocumentNumber :value="view.receivable.statementNo" />
              <FinancialStatus :status="STATUS_LABELS[view.summary.status]" :kind="statusKind(view.summary.status)" />
              <FinancialStatus v-if="view.summary.isOverdue" status="逾期" kind="danger" />
            </div>
            <p class="text-body text-text-secondary">
              {{ customerName }} · 所属月份 {{ view.receivable.accountingMonth }}
            </p>
            <p class="text-caption text-text-muted">
              到期日 {{ view.receivable.dueDate ?? '未约定到期日' }} · 派生基准日 {{ view.summary.asOf }}（DEMO_TODAY）
            </p>
          </div>
          <div class="flex flex-wrap gap-x-12 gap-y-6">
            <FinancialMetric label="应收金额" :value="view.receivable.originalAmount" />
            <FinancialMetric label="已收金额" :value="view.summary.paidAmount" caption="Σ 本单核销金额" />
            <FinancialMetric label="未收金额" :value="view.summary.outstandingAmount" caption="当前余额" />
          </div>
        </div>
      </section>

      <!-- 基本信息 -->
      <section class="rounded-panel border border-border bg-surface p-6">
        <h2 class="text-section-title font-semibold text-text-primary">基本信息</h2>
        <dl class="mt-4 grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
          <div class="flex items-center justify-between gap-4">
            <dt class="text-caption text-text-muted">对账单编号</dt>
            <dd><DocumentNumber :value="view.receivable.statementNo" /></dd>
          </div>
          <div class="flex items-center justify-between gap-4">
            <dt class="text-caption text-text-muted">客户</dt>
            <dd class="text-table text-text-primary">{{ customerName }}</dd>
          </div>
          <div class="flex items-center justify-between gap-4">
            <dt class="text-caption text-text-muted">所属月份</dt>
            <dd class="tabular text-table text-text-primary">{{ view.receivable.accountingMonth }}</dd>
          </div>
          <div class="flex items-center justify-between gap-4">
            <dt class="text-caption text-text-muted">对账日期</dt>
            <dd class="tabular text-table text-text-primary">{{ view.receivable.statementDate }}</dd>
          </div>
          <div class="flex items-center justify-between gap-4">
            <dt class="text-caption text-text-muted">到期日期</dt>
            <dd class="tabular text-table text-text-primary">{{ view.receivable.dueDate ?? '—' }}</dd>
          </div>
          <div class="flex items-center justify-between gap-4">
            <dt class="text-caption text-text-muted">创建时间</dt>
            <dd class="tabular text-table text-text-primary">{{ view.receivable.createdAt }}</dd>
          </div>
        </dl>
      </section>

      <!-- 回款记录（收款单实际总额 vs 本单核销金额） -->
      <section class="rounded-panel border border-border bg-surface p-6" data-testid="receipt-records">
        <h2 class="text-section-title font-semibold text-text-primary">回款记录</h2>
        <p class="mt-1 text-caption text-text-muted">
          「收款单实际总额」为该收款单的全部实际收款金额（一笔收款可能核销多张应收单）；
          「本单核销金额」为该收款单核销至本应收单的金额，本单已收金额 = Σ 本单核销金额。
        </p>
        <div v-if="receiptRows.length > 0" class="mt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>收款单编号</TableHead>
                <TableHead>到账日期</TableHead>
                <TableHead>入账账户</TableHead>
                <TableHead align="right">收款单实际总额</TableHead>
                <TableHead align="right">本单核销金额</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="row in receiptRows" :key="row.receiptId">
                <TableCell><DocumentNumber :value="row.receiptNo" /></TableCell>
                <TableCell class="tabular">{{ row.receiptDate }}</TableCell>
                <TableCell>{{ accountNameOf(row.accountId) }}</TableCell>
                <TableCell align="right">
                  <MoneyText :value="row.receiptActualAmount" size="table" />
                </TableCell>
                <TableCell align="right">
                  <MoneyText :value="row.allocatedToThisReceivable" size="table" />
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
        <div v-else class="mt-2 rounded-control border border-border">
          <EmptyState title="暂无回款记录" description="该应收单尚未产生任何核销。" />
        </div>
      </section>

      <!-- 核销明细 -->
      <section class="rounded-panel border border-border bg-surface p-6" data-testid="allocation-details">
        <h2 class="text-section-title font-semibold text-text-primary">核销明细</h2>
        <div v-if="allocationRows.length > 0" class="mt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>核销明细编号</TableHead>
                <TableHead>关联收款单</TableHead>
                <TableHead align="right">核销金额</TableHead>
                <TableHead>核销时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="row in allocationRows" :key="row.allocationId">
                <TableCell><DocumentNumber :value="row.allocationId" /></TableCell>
                <TableCell><DocumentNumber :value="row.receiptNo" /></TableCell>
                <TableCell align="right">
                  <MoneyText :value="row.allocationAmount" size="table" />
                </TableCell>
                <TableCell class="tabular">{{ row.allocatedAt }}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
        <div v-else class="mt-2 rounded-control border border-border">
          <EmptyState title="暂无核销明细" description="该应收单尚未被任何收款单核销。" />
        </div>
      </section>

      <!-- 备注 -->
      <section class="rounded-panel border border-border bg-surface p-6">
        <h2 class="text-section-title font-semibold text-text-primary">备注</h2>
        <p class="mt-2 text-body text-text-secondary">
          {{ view.receivable.remark ?? '无备注' }}
        </p>
      </section>

      <!-- 操作历史 -->
      <section class="rounded-panel border border-border bg-surface p-6">
        <h2 class="text-section-title font-semibold text-text-primary">操作历史</h2>
        <ol class="mt-4 flex flex-col gap-3">
          <li v-for="(entry, index) in auditEntries" :key="`${entry.at}-${index}`" class="flex items-baseline gap-3">
            <span class="tabular text-caption text-text-muted">{{ entry.at }}</span>
            <span class="text-table text-text-primary">{{ entry.event }}</span>
          </li>
        </ol>
      </section>
    </template>
  </div>
</template>
