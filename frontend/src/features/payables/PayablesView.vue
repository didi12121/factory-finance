<script setup lang="ts">
/**
 * 应付账款（真实 API：/payable/payables + /payable/payments）。
 *
 * 红线：
 * - 确认应付单不扣减资金；确认付款才产生资金流出并减少应付余额（后端保证）；
 * - 已付/未付/状态读取后端派生值，页面不自算余额副本；
 * - 本阶段全额核销：付款金额 = Σ 核销金额；不支持未分配付款与预付款；
 * - 已由 Phase 1 采购支出直接支付的应付单（fundedExpenseId 非空）禁止再次付款。
 */
import { computed, h, onMounted, ref, watch } from 'vue'

import type { ColumnDef } from '@tanstack/vue-table'

import Button from '@/components/ui/button/Button.vue'
import Select from '@/components/ui/select/Select.vue'
import Tabs from '@/components/ui/tabs/Tabs.vue'
import DocumentNumber from '@/components/finance/DocumentNumber.vue'
import FinancialMetric from '@/components/finance/FinancialMetric.vue'
import FinancialStatus from '@/components/finance/FinancialStatus.vue'
import MoneyText from '@/components/finance/MoneyText.vue'
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue'
import DataTable from '@/components/shared/DataTable.vue'
import ErrorState from '@/components/shared/ErrorState.vue'
import FilterBar from '@/components/shared/FilterBar.vue'
import FormDialog, { type FormFieldSchema } from '@/components/shared/FormDialog.vue'
import LoadingState from '@/components/shared/LoadingState.vue'
import PageHeader from '@/components/shared/PageHeader.vue'
import SearchInput from '@/components/shared/SearchInput.vue'
import { amountSortingFn } from '@/components/shared/tableSorting'
import { useToast } from '@/components/ui/toast/useToast'
import { toBusinessErrors } from '@/features/business/errorMapping'
import {
  masterdataApi,
  payableApi,
  type FundAccount,
  type FundableExpense,
  type PayablePaymentStatus,
  type PayableRecord,
  type PaymentRecord,
  type Supplier,
} from '@/services/api'
import { canonicalAmount2, sumAmounts } from '@/features/prototype/domain/amounts'
import { newIdempotencyKey } from '@/utils/idempotency'
import { todayLocalDate } from '@/utils/localDate'
import PaymentDialog from './PaymentDialog.vue'
import {
  PAYMENT_STATUS_LABELS,
  computePayableMetrics,
  openPayablesOf,
  paymentAllocatedTotal,
  paymentStatusKind,
} from './payablesModel'

const toast = useToast()
const today = todayLocalDate()

/* ------------------------------ 状态 ------------------------------ */

const activeTab = ref('payables')
const loading = ref(false)
const errorText = ref<string | null>(null)

const payables = ref<PayableRecord[]>([])
const payments = ref<PaymentRecord[]>([])
const suppliers = ref<Supplier[]>([])
const accounts = ref<FundAccount[]>([])

const keyword = ref('')
const supplierFilter = ref('all')
const statusFilter = ref<'ALL' | PayablePaymentStatus>('ALL')

const TAB_ITEMS = [
  { value: 'payables', label: '应付单' },
  { value: 'payments', label: '付款单' },
]

const statusOptions = [
  { label: '不限状态', value: 'ALL' },
  { label: PAYMENT_STATUS_LABELS.UNPAID, value: 'UNPAID' },
  { label: PAYMENT_STATUS_LABELS.PARTIALLY_PAID, value: 'PARTIALLY_PAID' },
  { label: PAYMENT_STATUS_LABELS.SETTLED, value: 'SETTLED' },
]

const supplierOptions = computed(() => [
  { label: '全部供应商', value: 'all' },
  ...suppliers.value.map((supplier) => ({ label: supplier.name, value: supplier.id })),
])

async function loadAll(): Promise<void> {
  loading.value = true
  errorText.value = null
  try {
    const [payablePage, paymentPage, supplierPage, accountPage] = await Promise.all([
      payableApi.listPayables({ page: 1, size: 500 }),
      payableApi.listPayments({ page: 1, size: 500 }),
      masterdataApi.listSuppliers({ page: 1, size: 500 }),
      masterdataApi.listAccounts({ page: 1, size: 500 }),
    ])
    payables.value = payablePage.items
    payments.value = paymentPage.items
    suppliers.value = supplierPage.items
    accounts.value = accountPage.items
  } catch (error) {
    errorText.value = toBusinessErrors(error, '应付数据加载失败，请重试。')[0]?.message ?? '加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(loadAll)

/* ------------------------------ 指标与筛选 ------------------------------ */

const metrics = computed(() => computePayableMetrics(payables.value))

const filteredPayables = computed(() => {
  const text = keyword.value.trim().toLowerCase()
  return payables.value.filter((row) => {
    if (row.status !== 'CONFIRMED') {
      return false
    }
    if (supplierFilter.value !== 'all' && row.supplierId !== supplierFilter.value) {
      return false
    }
    if (statusFilter.value !== 'ALL' && row.paymentStatus !== statusFilter.value) {
      return false
    }
    if (text === '') {
      return true
    }
    return (
      row.payableNo.toLowerCase().includes(text) ||
      row.content.toLowerCase().includes(text) ||
      (row.supplierName ?? '').toLowerCase().includes(text)
    )
  })
})

const filteredPayments = computed(() => {
  const text = keyword.value.trim().toLowerCase()
  return payments.value.filter((row) => {
    if (row.status !== 'CONFIRMED') {
      return false
    }
    if (supplierFilter.value !== 'all' && row.supplierId !== supplierFilter.value) {
      return false
    }
    if (text === '') {
      return true
    }
    return (
      row.paymentNo.toLowerCase().includes(text) ||
      (row.supplierName ?? '').toLowerCase().includes(text)
    )
  })
})

function clearFilters(): void {
  keyword.value = ''
  supplierFilter.value = 'all'
  statusFilter.value = 'ALL'
}

/* ------------------------------ 列表列 ------------------------------ */

function supplierNameOf(row: PayableRecord | PaymentRecord): string {
  return row.supplierName ?? row.supplierId
}

const payableColumns: ColumnDef<PayableRecord, string>[] = [
  {
    id: 'payableNo',
    accessorFn: (row) => row.payableNo,
    header: '应付单号',
    cell: (info) => h(DocumentNumber, { value: info.getValue() }),
  },
  {
    id: 'supplierName',
    accessorFn: (row) => supplierNameOf(row),
    header: '供应商',
    cell: (info) => h('span', { class: 'text-table text-text-primary' }, info.getValue()),
  },
  {
    id: 'bizDate',
    accessorFn: (row) => row.bizDate,
    header: '业务日期',
    cell: (info) => h('span', { class: 'tabular text-table' }, info.getValue()),
  },
  {
    id: 'dueDate',
    accessorFn: (row) => row.dueDate ?? '',
    header: '到期日期',
    cell: (info) => h('span', { class: 'tabular text-table' }, info.getValue() === '' ? '—' : info.getValue()),
  },
  {
    id: 'amount',
    accessorFn: (row) => row.amount,
    header: '应付金额',
    meta: { align: 'right' },
    sortingFn: amountSortingFn,
    cell: (info) => h(MoneyText, { value: info.getValue(), size: 'table' }),
  },
  {
    id: 'paidAmount',
    accessorFn: (row) => row.paidAmount,
    header: '已付金额',
    meta: { align: 'right' },
    sortingFn: amountSortingFn,
    cell: (info) => h(MoneyText, { value: info.getValue(), size: 'table' }),
  },
  {
    id: 'outstandingAmount',
    accessorFn: (row) => row.outstandingAmount,
    header: '未付余额',
    meta: { align: 'right' },
    sortingFn: amountSortingFn,
    cell: (info) => h(MoneyText, { value: info.getValue(), size: 'table' }),
  },
  {
    id: 'paymentStatus',
    accessorFn: (row) => row.paymentStatus,
    header: '付款状态',
    cell: (info) =>
      h(FinancialStatus, {
        status: PAYMENT_STATUS_LABELS[info.row.original.paymentStatus],
        kind: paymentStatusKind(info.row.original.paymentStatus),
      }),
  },
  {
    id: 'actions',
    header: '操作',
    meta: { align: 'right' },
    cell: (info) =>
      h('div', { class: 'flex justify-end gap-1 whitespace-nowrap' }, [
        h(
          Button,
          {
            variant: 'ghost',
            size: 'sm',
            'data-testid': 'row-pay',
            disabled: info.row.original.fundedExpenseId !== null,
            title:
              info.row.original.fundedExpenseId === null
                ? ''
                : '该应付已由采购支出单直接支付，禁止重复付款',
            onClick: () => openPayment(info.row.original),
          },
          () => '付款',
        ),
        h(
          Button,
          {
            variant: 'ghost',
            size: 'sm',
            'data-testid': 'row-void-payable',
            onClick: () => askVoidPayable(info.row.original),
          },
          () => '撤销',
        ),
      ]),
  },
]

const paymentColumns: ColumnDef<PaymentRecord, string>[] = [
  {
    id: 'paymentNo',
    accessorFn: (row) => row.paymentNo,
    header: '付款单号',
    cell: (info) => h(DocumentNumber, { value: info.getValue() }),
  },
  {
    id: 'supplierName',
    accessorFn: (row) => supplierNameOf(row),
    header: '供应商',
    cell: (info) => h('span', { class: 'text-table text-text-primary' }, info.getValue()),
  },
  {
    id: 'paymentDate',
    accessorFn: (row) => row.paymentDate,
    header: '付款日期',
    cell: (info) => h('span', { class: 'tabular text-table' }, info.getValue()),
  },
  {
    id: 'amount',
    accessorFn: (row) => row.amount,
    header: '付款金额',
    meta: { align: 'right' },
    sortingFn: amountSortingFn,
    cell: (info) => h(MoneyText, { value: info.getValue(), size: 'table' }),
  },
  {
    id: 'allocated',
    accessorFn: (row) => paymentAllocatedTotal(row),
    header: '核销合计',
    meta: { align: 'right' },
    sortingFn: amountSortingFn,
    cell: (info) => h(MoneyText, { value: info.getValue(), size: 'table' }),
  },
  {
    id: 'accountName',
    accessorFn: (row) => row.accountName ?? '',
    header: '付款账户',
    cell: (info) => h('span', { class: 'text-table text-text-primary' }, info.getValue()),
  },
  {
    id: 'actions',
    header: '操作',
    meta: { align: 'right' },
    cell: (info) =>
      h(
        Button,
        {
          variant: 'ghost',
          size: 'sm',
          'data-testid': 'row-void-payment',
          onClick: () => askVoidPayment(info.row.original),
        },
        () => '撤销',
      ),
  },
]

/* ------------------------------ 新增应付单 ------------------------------ */

const createOpen = ref(false)
const createForm = ref<Record<string, string>>({})
const fundableExpenses = ref<FundableExpense[]>([])
const createErrors = ref<Record<string, string>>({})
const creating = ref(false)
const createKey = ref(newIdempotencyKey('ap'))

const selectedExpense = computed(() => {
  const id = createForm.value.fundedExpenseId ?? ''
  return id === '' ? null : (fundableExpenses.value.find((item) => item.expenseId === id) ?? null)
})

const createFields = computed<FormFieldSchema[]>(() => [
  {
    key: 'fundedExpenseId',
    label: '关联已支付采购支出',
    type: 'select',
    placeholder: '选填：关联 Phase 1 已直接支付的采购支出',
    hint: '同一采购支出最多关联一张有效应付单；关联后金额固定等于支出金额，且禁止再次付款',
    options: [
      { label: '不关联', value: '' },
      ...fundableExpenses.value.map((item) => ({
        label: `${item.docNo} · ${item.payDate} · ${item.amount}`,
        value: item.expenseId,
      })),
    ],
  },
  {
    key: 'supplierId',
    label: '供应商',
    type: 'select',
    required: true,
    placeholder: '请选择供应商',
    options: suppliers.value
      .filter((supplier) => supplier.status === 'ENABLED')
      .map((supplier) => ({ label: supplier.name, value: supplier.id })),
  },
  { key: 'bizDate', label: '业务日期', type: 'date', required: true, hint: '不得晚于当前业务日期' },
  { key: 'dueDate', label: '到期日期', type: 'date', hint: '选填；不得早于业务日期' },
  {
    key: 'amount',
    label: '应付金额',
    type: 'amount',
    required: true,
    disabled: selectedExpense.value !== null,
    hint: selectedExpense.value === null ? undefined : '已关联采购支出，金额固定等于支出金额',
  },
  {
    key: 'content',
    label: '业务内容',
    type: 'text',
    required: true,
    placeholder: '如：11月原料采购',
    disabled: selectedExpense.value !== null,
  },
  { key: 'remark', label: '备注', type: 'text', placeholder: '选填' },
])

async function openCreate(): Promise<void> {
  createForm.value = {
    fundedExpenseId: '',
    supplierId: '',
    bizDate: today,
    dueDate: '',
    amount: '',
    content: '',
    remark: '',
  }
  createErrors.value = {}
  createKey.value = newIdempotencyKey('ap')
  createOpen.value = true
  try {
    fundableExpenses.value = await payableApi.listFundableExpenses()
  } catch {
    // 候选加载失败不阻断手工建单（不关联采购支出）
    fundableExpenses.value = []
  }
}

/** 选择已支付采购支出后自动填充金额与内容（金额必须等于支出金额） */
watch(
  () => createForm.value.fundedExpenseId,
  (expenseId) => {
    const expense = expenseId === undefined || expenseId === '' ? null : fundableExpenses.value.find((item) => item.expenseId === expenseId)
    if (expense === null || expense === undefined) {
      return
    }
    createForm.value.amount = expense.amount
    if ((createForm.value.content ?? '').trim() === '') {
      createForm.value.content = `采购支出 ${expense.docNo}`
    }
  },
)

async function submitCreate(): Promise<void> {
  const errors: Record<string, string> = {}
  if ((createForm.value.supplierId ?? '') === '') {
    errors.supplierId = '请选择供应商'
  }
  if ((createForm.value.bizDate ?? '') === '') {
    errors.bizDate = '请选择业务日期'
  }
  if ((createForm.value.amount ?? '').trim() === '') {
    errors.amount = '请输入应付金额'
  }
  if ((createForm.value.content ?? '').trim() === '') {
    errors.content = '请输入业务内容'
  }
  createErrors.value = errors
  if (Object.keys(errors).length > 0) {
    return
  }
  creating.value = true
  try {
    const expenseId = (createForm.value.fundedExpenseId ?? '').trim()
    await payableApi.createPayable({
      fundedExpenseId: expenseId === '' ? null : Number(expenseId),
      supplierId: Number(createForm.value.supplierId),
      bizDate: createForm.value.bizDate,
      dueDate: (createForm.value.dueDate ?? '') === '' ? null : createForm.value.dueDate,
      amount: createForm.value.amount,
      content: (createForm.value.content ?? '').trim(),
      remark: (createForm.value.remark ?? '').trim() === '' ? null : (createForm.value.remark ?? '').trim(),
      idempotencyKey: createKey.value,
    })
    toast.success('应付单已创建', '确认应付不扣减资金，付款时才产生资金流出。')
    createOpen.value = false
    await loadAll()
  } catch (error) {
    const mapped = toBusinessErrors(error, '创建失败，请稍后重试。')
    createErrors.value = mapped[0]?.fieldErrors ?? {}
    if (Object.keys(createErrors.value).length === 0) {
      toast.error('创建失败', mapped[0]?.message ?? '创建失败')
    }
  } finally {
    creating.value = false
  }
}

/* ------------------------------ 付款 ------------------------------ */

const paymentOpen = ref(false)
const paymentSupplierId = ref('')
const paymentInitialId = ref<string | null>(null)

const paymentCandidates = computed(() =>
  openPayablesOf(payables.value, paymentSupplierId.value),
)

function openPayment(row: PayableRecord): void {
  paymentSupplierId.value = row.supplierId
  paymentInitialId.value = row.id
  paymentOpen.value = true
}

/* ------------------------------ 撤销 ------------------------------ */

const voidTarget = ref<PayableRecord | null>(null)
const voidPayableOpen = ref(false)

function askVoidPayable(row: PayableRecord): void {
  voidTarget.value = row
  voidPayableOpen.value = true
}

async function confirmVoidPayable(): Promise<void> {
  const row = voidTarget.value
  if (row === null) {
    return
  }
  try {
    await payableApi.voidPayable(row.id, today)
    toast.success('应付单已撤销', '原单据保留，撤销记录可追溯。')
    await loadAll()
  } catch (error) {
    toast.error('撤销失败', toBusinessErrors(error, '撤销失败，请稍后重试。')[0]?.message ?? '撤销失败')
  } finally {
    voidTarget.value = null
  }
}

const voidPaymentTarget = ref<PaymentRecord | null>(null)
const voidPaymentOpen = ref(false)

function askVoidPayment(row: PaymentRecord): void {
  voidPaymentTarget.value = row
  voidPaymentOpen.value = true
}

async function confirmVoidPayment(): Promise<void> {
  const row = voidPaymentTarget.value
  if (row === null) {
    return
  }
  try {
    await payableApi.voidPayment(row.id, today)
    toast.success('付款单已撤销', '原单据与核销明细保留，已生成反向流水冲回资金。')
    await loadAll()
  } catch (error) {
    toast.error('撤销失败', toBusinessErrors(error, '撤销失败，请稍后重试。')[0]?.message ?? '撤销失败')
  } finally {
    voidPaymentTarget.value = null
  }
}

/** 付款后刷新（应收/应付派生值回到后端权威口径） */
async function onPaymentConfirmed(): Promise<void> {
  await loadAll()
}

const outstandingSum = computed(() =>
  canonicalAmount2(sumAmounts(filteredPayables.value.map((row) => row.outstandingAmount))),
)
</script>

<template>
  <div class="flex flex-col gap-6" data-testid="payables-page">
    <PageHeader title="应付账款" description="供应商应付登记与付款核销；确认应付不扣减资金，付款才产生资金流出。">
      <template #actions>
        <Button variant="secondary" data-testid="create-payable" :disabled="suppliers.length === 0" @click="openCreate">
          新增应付单
        </Button>
      </template>
    </PageHeader>

    <section class="rounded-panel border border-border bg-surface p-6" data-testid="payables-metrics">
      <div class="flex flex-wrap gap-x-12 gap-y-6">
        <FinancialMetric label="应付金额合计" :value="metrics.totalAmount" caption="Σ 已确认应付单金额" />
        <FinancialMetric label="已付金额合计" :value="metrics.totalPaid" caption="Σ 有效付款核销" />
        <FinancialMetric label="未付余额" :value="metrics.totalOutstanding" caption="Σ 未付余额（当前负债）" />
        <FinancialMetric label="筛选后未付" :value="outstandingSum" caption="当前筛选结果合计" />
      </div>
      <p class="mt-4 text-caption text-text-muted">统计范围：全部已确认应付单 · 统计基准日：{{ today }}</p>
    </section>

    <Tabs v-model="activeTab" :items="TAB_ITEMS">
      <template v-for="tab in TAB_ITEMS" :key="tab.value" #[tab.value]>
        <div class="flex flex-col gap-4">
          <FilterBar>
            <SearchInput v-model="keyword" placeholder="搜索单号、供应商或业务内容…" data-testid="filter-keyword" />
            <Select
              v-model="supplierFilter"
              :options="supplierOptions"
              class="w-44"
              aria-label="供应商筛选"
              data-testid="filter-supplier"
            />
            <Select
              v-if="tab.value === 'payables'"
              v-model="statusFilter"
              :options="statusOptions"
              class="w-36"
              aria-label="付款状态筛选"
              data-testid="filter-status"
            />
            <Button variant="secondary" size="sm" data-testid="filter-clear" @click="clearFilters">清空</Button>
          </FilterBar>

          <ErrorState v-if="errorText !== null" title="数据加载失败" :description="errorText">
            <template #actions>
              <Button variant="secondary" data-testid="payables-retry" @click="loadAll">重试</Button>
            </template>
          </ErrorState>

          <div
            v-else-if="loading && payables.length === 0"
            class="rounded-panel border border-border bg-surface"
          >
            <LoadingState :rows="5" label="应付数据加载中" />
          </div>

          <div v-else-if="tab.value === 'payables'" data-testid="payables-table">
            <DataTable
              :columns="payableColumns"
              :data="filteredPayables"
              :loading="loading"
              empty-text="暂无应付单"
            />
          </div>

          <div v-else data-testid="payments-table">
            <DataTable
              :columns="paymentColumns"
              :data="filteredPayments"
              :loading="loading"
              empty-text="暂无付款单"
            />
          </div>
        </div>
      </template>
    </Tabs>

    <FormDialog
      v-model:open="createOpen"
      v-model:model-value="createForm"
      title="新增应付单"
      description="确认应付只登记债务，不扣减资金。"
      :fields="createFields"
      :errors="createErrors"
      :submitting="creating"
      submit-text="确认应付"
      @submit="submitCreate"
    />

    <PaymentDialog
      v-model:open="paymentOpen"
      :supplier-id="paymentSupplierId"
      :payables="paymentCandidates"
      :accounts="accounts"
      :initial-payable-id="paymentInitialId"
      @confirmed="onPaymentConfirmed"
    />

    <ConfirmDialog
      v-model:open="voidPayableOpen"
      title="确认撤销应付单"
      :description="`撤销保留原单据并生成可追溯撤销记录；已有付款核销的应付单不可撤销。单据：${voidTarget?.payableNo ?? ''}。`"
      confirm-text="确认撤销"
      danger
      @confirm="confirmVoidPayable"
    />

    <ConfirmDialog
      v-model:open="voidPaymentOpen"
      title="确认撤销付款单"
      :description="`撤销保留原单据与核销明细，并生成反向流水冲回资金。单据：${voidPaymentTarget?.paymentNo ?? ''}。`"
      confirm-text="确认撤销"
      danger
      @confirm="confirmVoidPayment"
    />
  </div>
</template>
