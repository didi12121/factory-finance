<script setup lang="ts">
/**
 * 登记回款（唯一回款登记 UI）：基本信息 + 多对多核销分配 + 实时汇总 + 提交确认。
 *
 * 红线：
 * - 数据经 useBusinessStore 读写真实后端（previewReceiptAllocation / autoAllocateReceipt /
 *   validateReceiptAllocation / confirmReceipt）；UI 校验不可替代后端校验；
 * - 金额控件一律 AmountInput（提交前 validate()），汇总与派生走 domain 纯方法
 *   （preview 结果由 domain/allocation 计算，比较用 compareAmounts）；
 * - autoAllocateReceipt 只出预览：建议写入行输入，确认前不落任何状态；
 * - 未分配 > 0 展示金额与 Phase 2 规则说明并禁止确认；
 * - 确认收款幂等：同一表单会话 idempotencyKey 稳定 + submitting 防双击，
 *   后端请求幂等表唯一约束为最终防线。
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'

import { Check } from '@lucide/vue'

import AmountInput from '@/components/finance/AmountInput.vue'
import DocumentNumber from '@/components/finance/DocumentNumber.vue'
import MoneyText from '@/components/finance/MoneyText.vue'
import Button from '@/components/ui/button/Button.vue'
import Input from '@/components/ui/input/Input.vue'
import Select from '@/components/ui/select/Select.vue'
import Table from '@/components/ui/table/Table.vue'
import TableBody from '@/components/ui/table/TableBody.vue'
import TableCell from '@/components/ui/table/TableCell.vue'
import TableHead from '@/components/ui/table/TableHead.vue'
import TableHeader from '@/components/ui/table/TableHeader.vue'
import TableRow from '@/components/ui/table/TableRow.vue'
import { useToast } from '@/components/ui/toast/useToast'
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue'
import EmptyState from '@/components/shared/EmptyState.vue'
import ErrorState from '@/components/shared/ErrorState.vue'
import FormField from '@/components/shared/FormField.vue'
import LoadingState from '@/components/shared/LoadingState.vue'
import {
  RECEIVABLES_ROUTE_PATH,
  type AllocationPreview,
  type BusinessError,
  type ConfirmReceiptCommand,
  type EntityId,
  type LocalDate,
  type Receipt,
  type ReceiptAllocation,
} from '@/features/prototype/contracts'
import { useBusinessStore } from '@/features/business/businessStore'
import { toBusinessErrors } from '@/features/business/errorMapping'
import { todayLocalDate } from '@/utils/localDate'
import { sumAmounts } from '@/features/prototype/domain/amounts'
import { compareAmounts } from '@/utils/decimal'
import { BusinessDateInput } from '@/components/ui/date'
import {
  buildAllocationDrafts,
  buildConfirmReceiptCommand,
  buildOpenReceivableRows,
  buildPreviewCommand,
  canonicalDisplayAmount,
  type AllocationRowView,
  type ReceiptRegistrationDraft,
} from './receiptModel'

/** 资金流水页路径（contracts/navigation.ts 未冻结该常量，与 router/index.ts 保持一致） */
const TREASURY_TRANSACTIONS_ROUTE_PATH = '/treasury/transactions'

const props = defineProps<{
  /** 登记表单展开状态（PageHeader 动作 / 路由 action=create 驱动） */
  open: boolean
  /** 路由契约预填（已由 parseProcessingFeeRouteQuery 验证归属与有效性） */
  prefill: { customerId: EntityId | null; receivableId: EntityId | null } | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  /** 确认成功（收款单 ID），父级刷新列表 */
  confirmed: [receiptId: EntityId]
}>()

const store = useBusinessStore()
const today = todayLocalDate()
const toast = useToast()

/* ------------------------------ 表单状态 ------------------------------ */

const customerId = ref('')
const receiptDate = ref<LocalDate>(today)
const accountId = ref('')
const actualAmount = ref('')
const externalRef = ref('')
const remark = ref('')
/** 幂等键：同一表单会话稳定（重复提交由 Store 幂等去重兜底），表单重置后换新 */
const idempotencyKey = ref('')
/** 路由预填定位的目标应收单（仅高亮定位，不预填任何金额，不误核销） */
const targetReceivableId = ref<EntityId | null>(null)

/** 核销行输入（应收单 ID → 本次核销金额）与行有效性 */
const amounts = reactive<Record<EntityId, string>>({})
const rowValidity = reactive<Record<EntityId, boolean>>({})

interface AmountInputHandle {
  validate(): boolean
  reset(): void
}

const actualAmountInput = ref<AmountInputHandle | null>(null)
const rowInputHandles = new Map<EntityId, AmountInputHandle>()

function setActualAmountInputHandle(el: unknown): void {
  actualAmountInput.value = el as AmountInputHandle | null
}

function setRowInputHandle(id: EntityId, el: unknown): void {
  const handle = el as AmountInputHandle | null
  if (handle === null) {
    rowInputHandles.delete(id)
  } else {
    rowInputHandles.set(id, handle)
  }
}

/** 生成表单会话幂等键（非财务运算，仅去重标识） */
function createIdempotencyKey(): string {
  const random = Math.random().toString(36).slice(2, 10)
  return `sk-form-${Date.now()}-${random}`
}

/* ------------------------------ 基础选项 ------------------------------ */

const customerOptions = computed(() =>
  store.customers.filter((item) => item.status === 'ENABLED').map((item) => ({ label: item.name, value: item.id })),
)

const accountOptions = computed(() =>
  store.fundAccounts.filter((item) => item.enabled).map((item) => ({ label: item.name, value: item.id })),
)

watch(
  accountOptions,
  (options) => {
    if (accountId.value === '' && options.length > 0) {
      const first = options[0]
      if (first !== undefined) {
        accountId.value = first.value
      }
    }
  },
  { immediate: true },
)

/* ------------------------ 未结清应收单（核销分配表） ------------------------ */

const openRows = ref<AllocationRowView[]>([])
const rowsLoading = ref(false)
const rowsError = ref<string | null>(null)
let rowsGeneration = 0

async function loadOpenRows(): Promise<void> {
  const generation = ++rowsGeneration
  if (customerId.value === '') {
    openRows.value = []
    rowsError.value = null
    return
  }
  rowsLoading.value = true
  rowsError.value = null
  try {
    const result = await store.listReceivables({ page: 1, size: 500, customerId: customerId.value })
    if (generation !== rowsGeneration) {
      return
    }
    openRows.value = buildOpenReceivableRows(result.items)
  } catch (error) {
    if (generation !== rowsGeneration) {
      return
    }
    openRows.value = []
    rowsError.value = error instanceof Error ? error.message : '加载应收单失败，请重试'
  } finally {
    if (generation === rowsGeneration) {
      rowsLoading.value = false
    }
  }
}

// 选客户后加载；核销明细变化（确认成功）后刷新派生的已收/未收
watch([customerId, () => store.receiptAllocations.length], () => void loadOpenRows())

watch(customerId, () => {
  for (const key of Object.keys(amounts)) {
    amounts[key] = ''
  }
})

/* ------------------------------ 实时汇总 ------------------------------ */

const preview = ref<AllocationPreview | null>(null)
let previewGeneration = 0

function registrationDraft(): ReceiptRegistrationDraft {
  return {
    idempotencyKey: idempotencyKey.value,
    customerId: customerId.value,
    receiptDate: receiptDate.value,
    accountId: accountId.value,
    actualAmount: actualAmount.value,
    externalRef: externalRef.value,
    remark: remark.value,
    amounts: { ...amounts },
  }
}

async function refreshPreview(): Promise<void> {
  const generation = ++previewGeneration
  if (customerId.value === '') {
    preview.value = null
    return
  }
  try {
    const result = await store.previewReceiptAllocation(buildPreviewCommand(registrationDraft()))
    if (generation === previewGeneration) {
      preview.value = result
    }
  } catch (error) {
    if (generation === previewGeneration) {
      preview.value = {
        allocations: [],
        totalAllocated: '0.00',
        unallocated: '0.00',
        validationErrors: toBusinessErrors(error, '核销预览失败，请重试'),
      }
    }
  }
}

watch([customerId, actualAmount, amounts], () => void refreshPreview(), { deep: true })

/** 实时校验错误（实际收款未填写时隐藏对应字段错误，由必填提示与提交校验处理） */
const previewErrors = computed<BusinessError[]>(() => {
  const errors = preview.value?.validationErrors ?? []
  if (actualAmount.value !== '') {
    return errors
  }
  return errors.filter((error) => error.fieldErrors?.actualAmount === undefined)
})

const summaryActual = computed(() => canonicalDisplayAmount(actualAmount.value))
const summaryAllocated = computed(() => preview.value?.totalAllocated ?? '0.00')
const summaryUnallocated = computed(() => preview.value?.unallocated ?? '0.00')
const unallocatedPositive = computed(
  () => preview.value !== null && compareAmounts(summaryUnallocated.value, '0') > 0,
)

const actualValid = ref(false)

const rowsValid = computed(() => {
  for (const row of openRows.value) {
    const handle = rowInputHandles.get(row.receivableId)
    if (handle === undefined && rowValidity[row.receivableId] === false) {
      return false
    }
    if (handle !== undefined && rowValidity[row.receivableId] === false) {
      return false
    }
  }
  return true
})

const canConfirm = computed(
  () =>
    customerId.value !== '' &&
    accountId.value !== '' &&
    receiptDate.value !== '' &&
    actualAmount.value !== '' &&
    actualValid.value &&
    rowsValid.value &&
    preview.value !== null &&
    preview.value.validationErrors.length === 0,
)

const autoReady = computed(() => {
  const actual = summaryActual.value
  return customerId.value !== '' && actual !== null && compareAmounts(actual, '0') > 0
})

/* ------------------------------ 分配操作 ------------------------------ */

/** 自动分配（按到期日优先）：autoAllocateReceipt 仅出预览，建议写入行输入 */
async function onAutoAllocate(): Promise<void> {
  if (!autoReady.value) {
    return
  }
  const result = await store.autoAllocateReceipt({
    customerId: customerId.value,
    actualAmount: actualAmount.value,
  })
  for (const key of Object.keys(amounts)) {
    amounts[key] = ''
  }
  for (const draft of result.allocations) {
    amounts[draft.receivableId] = draft.allocationAmount
  }
  await afterAmountsReset()
}

/** 清空分配（含非法输入残留草稿） */
function onClearAllocations(): void {
  for (const key of Object.keys(amounts)) {
    amounts[key] = ''
  }
  void afterAmountsReset()
}

async function afterAmountsReset(): Promise<void> {
  await Promise.resolve()
  for (const handle of rowInputHandles.values()) {
    handle.reset()
  }
}

/* ------------------------------ 提交确认 ------------------------------ */

const dialogOpen = ref(false)
const pendingCommand = ref<ConfirmReceiptCommand | null>(null)
const submitErrors = ref<BusinessError[]>([])
const submitting = ref(false)
const result = ref<{
  receipt: Receipt
  allocations: ReceiptAllocation[]
  transactionNo: string | null
} | null>(null)

/** 提交前校验：AmountInput.validate()（实际收款必填 + 各核销行）+ Store 全量校验 */
async function onClickConfirm(): Promise<void> {
  if (submitting.value) {
    return
  }
  submitErrors.value = []
  const actualOk = actualAmountInput.value?.validate() ?? false
  let rowsOk = true
  for (const row of openRows.value) {
    const handle = rowInputHandles.get(row.receivableId)
    rowsOk = (handle?.validate() ?? rowValidity[row.receivableId] !== false) && rowsOk
  }
  if (!actualOk || !rowsOk) {
    submitErrors.value = [{ code: 'VALIDATION_ERROR', message: '存在金额输入错误，请修正后再提交' }]
    return
  }
  const command = buildConfirmReceiptCommand(registrationDraft())
  const errors = await store.validateReceiptAllocation(command)
  if (errors.length > 0) {
    submitErrors.value = errors
    return
  }
  pendingCommand.value = command
  dialogOpen.value = true
}

/** 确认收款（原子 + 幂等；失败零变化）；submitting 防双击 */
async function onDialogConfirm(): Promise<void> {
  if (submitting.value || pendingCommand.value === null) {
    return
  }
  submitting.value = true
  dialogOpen.value = false
  try {
    const receipt = await store.confirmReceipt(pendingCommand.value)
    const detail = await store.getReceiptById(receipt.id)
    result.value = {
      receipt,
      allocations: detail?.allocations ?? [],
      transactionNo: store.transactionNoOfReceipt(receipt.id),
    }
    toast.success('回款已确认', `${receipt.receiptNo} 已登记，资金流入 1 笔`)
    emit('confirmed', receipt.id)
    resetForm()
  } catch (error) {
    submitErrors.value = toBusinessErrors(error, '确认收款失败，请重试')
  } finally {
    submitting.value = false
    pendingCommand.value = null
  }
}

function resetForm(): void {
  actualAmount.value = ''
  externalRef.value = ''
  remark.value = ''
  receiptDate.value = today
  targetReceivableId.value = null
  for (const key of Object.keys(amounts)) {
    amounts[key] = ''
  }
  idempotencyKey.value = createIdempotencyKey()
}

/* ------------------------------ 确认信息展示 ------------------------------ */

const confirmSummary = computed(() => {
  const command = pendingCommand.value
  if (command === null) {
    return null
  }
  const statementNoOf = (receivableId: EntityId): string => {
    const fromRows = openRows.value.find((row) => row.receivableId === receivableId)
    if (fromRows !== undefined) {
      return fromRows.statementNo
    }
    return store.receivables.find((item) => item.id === receivableId)?.statementNo ?? receivableId
  }
  return {
    customerName: store.customerById(command.customerId)?.name ?? command.customerId,
    accountName: store.accountById(command.accountId)?.name ?? command.accountId,
    receiptDate: command.receiptDate,
    actualAmount: canonicalDisplayAmount(command.actualAmount) ?? command.actualAmount,
    totalAllocated: sumAmounts(
      buildAllocationDrafts({ ...amounts }).map((item) => item.allocationAmount),
    ),
    rows: command.allocations.map((item) => ({
      receivableId: item.receivableId,
      statementNo: statementNoOf(item.receivableId),
      allocationAmount: canonicalDisplayAmount(item.allocationAmount) ?? item.allocationAmount,
    })),
  }
})

const resultSummary = computed(() => {
  const current = result.value
  if (current === null) {
    return null
  }
  return {
    receiptNo: current.receipt.receiptNo,
    transactionNo: current.transactionNo,
    allocationCount: current.allocations.length,
    totalAllocated: sumAmounts(current.allocations.map((item) => item.allocationAmount)),
    receivableIds: Array.from(new Set(current.allocations.map((item) => item.receivableId))),
  }
})

function statementNoOfResult(receivableId: EntityId): string {
  return store.receivables.find((item) => item.id === receivableId)?.statementNo ?? receivableId
}

/* ------------------------------ 路由预填 ------------------------------ */

watch(
  () => props.prefill,
  (value) => {
    if (value === null) {
      return
    }
    if (value.customerId !== null) {
      customerId.value = value.customerId
    }
    targetReceivableId.value = value.receivableId
  },
  { immediate: true },
)

/* ------------------------------ 响应式布局 ------------------------------ */

/** 核销分配布局：< 768px 使用堆叠卡片（390px 可完整完成核销操作） */
const isDesktopLayout = ref(true)

function syncLayout(): void {
  isDesktopLayout.value = window.innerWidth >= 768
}

onMounted(() => {
  idempotencyKey.value = createIdempotencyKey()
  syncLayout()
  window.addEventListener('resize', syncLayout)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', syncLayout)
})

/* ------------------------------ 初始加载 ------------------------------ */

void loadOpenRows()
void refreshPreview()
</script>

<template>
  <section v-if="props.open" id="receipt-registration" class="rounded-panel border border-border bg-surface">
    <div class="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
      <div class="min-w-0">
        <h2 class="text-section-title font-semibold text-text-primary">登记回款</h2>
        <p class="mt-1 text-caption text-text-muted">
          实际收款只记一次资金流入；核销明细与收款单同事务确认，不产生额外流水。
        </p>
      </div>
      <Button variant="ghost" size="sm" @click="emit('update:open', false)">收起</Button>
    </div>

    <div class="flex flex-col gap-6 p-5">
      <!-- 基本信息 -->
      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <FormField id="receipt-customer" label="客户" required>
          <Select
            id="receipt-customer"
            v-model="customerId"
            :options="customerOptions"
            placeholder="选择客户"
            data-testid="registration-customer"
          />
        </FormField>

        <FormField id="receipt-date" label="收款日期" required>
          <!-- 统一业务日期组件：格式提示 + 回显（F-008）；实际收款日期 ≤ 业务基准日（Domain 最终校验） -->
          <BusinessDateInput
            id="receipt-date"
            v-model="receiptDate"
            :max="today"
            required
            data-testid="registration-date"
          />
        </FormField>

        <FormField id="receipt-account" label="收款账户" required>
          <Select
            id="receipt-account"
            v-model="accountId"
            :options="accountOptions"
            placeholder="选择资金账户"
            data-testid="registration-account"
          />
        </FormField>

        <FormField id="actual-amount" label="实际收款金额" required>
          <AmountInput
            id="actual-amount"
            :ref="setActualAmountInputHandle"
            v-model="actualAmount"
            :required="true"
            placeholder="0.00"
            @update:valid="actualValid = $event"
          />
        </FormField>

        <FormField id="external-ref" label="外部流水参考号" hint="如银行流水号，可空">
          <Input
            id="external-ref"
            v-model="externalRef"
            placeholder="如银行流水号"
            data-testid="registration-external-ref"
          />
        </FormField>

        <FormField id="receipt-remark" label="备注" hint="可空">
          <Input id="receipt-remark" v-model="remark" placeholder="备注信息" data-testid="registration-remark" />
        </FormField>
      </div>

      <!-- 核销分配 -->
      <div class="flex flex-col gap-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="min-w-0">
            <h3 class="text-body font-medium text-text-primary">核销分配</h3>
            <p class="text-caption text-text-muted">
              选客户后加载其未结清应收单；本次核销金额按到期日期先后可一键自动分配，也可逐单手动指定。
            </p>
          </div>
          <div class="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              data-testid="auto-allocate"
              :disabled="!autoReady || submitting"
              @click="onAutoAllocate"
            >
              自动分配（按到期日优先）
            </Button>
            <Button variant="ghost" size="sm" data-testid="clear-allocations" @click="onClearAllocations">
              清空分配
            </Button>
          </div>
        </div>

        <div v-if="customerId === ''" class="rounded-control border border-border bg-surface-hover px-4 py-6 text-center text-caption text-text-muted">
          请先选择客户，加载其未结清应收单后进行核销分配。
        </div>

        <ErrorState
          v-else-if="rowsError !== null"
          title="应收单加载失败"
          :description="rowsError"
          data-testid="allocation-error-state"
        >
          <template #actions>
            <Button variant="secondary" size="sm" @click="void loadOpenRows()">重试</Button>
          </template>
        </ErrorState>

        <LoadingState v-else-if="rowsLoading" :rows="3" label="应收单加载中…" />

        <EmptyState
          v-else-if="openRows.length === 0"
          title="该客户暂无未结清应收单"
          description="全部应收单均已结清，无需核销。"
          data-testid="allocation-empty"
        />

        <!-- 桌面：核销分配表 -->
        <Table v-else-if="isDesktopLayout" data-testid="allocation-table">
          <TableHeader>
            <TableRow>
              <TableHead>对账单编号</TableHead>
              <TableHead>所属月份</TableHead>
              <TableHead>到期日期</TableHead>
              <TableHead align="right">应收金额</TableHead>
              <TableHead align="right">已收</TableHead>
              <TableHead align="right">当前未收</TableHead>
              <TableHead align="right">本次核销金额</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow
              v-for="row in openRows"
              :key="row.receivableId"
              :data-testid="`allocation-row-${row.receivableId}`"
              :class="row.receivableId === targetReceivableId ? 'bg-brand-subtle' : ''"
            >
              <TableCell>
                <DocumentNumber :value="row.statementNo" />
                <span v-if="row.receivableId === targetReceivableId" class="ml-2 text-caption text-brand-foreground">
                  来自应收单
                </span>
              </TableCell>
              <TableCell>{{ row.accountingMonth }}</TableCell>
              <TableCell>{{ row.dueDate ?? '—' }}</TableCell>
              <TableCell align="right"><MoneyText :value="row.originalAmount" size="table" /></TableCell>
              <TableCell align="right"><MoneyText :value="row.paidAmount" size="table" /></TableCell>
              <TableCell align="right"><MoneyText :value="row.outstandingAmount" size="table" /></TableCell>
              <TableCell align="right">
                <div class="ml-auto w-36">
                  <label :for="`allocation-input-${row.receivableId}`" class="sr-only">
                    {{ row.statementNo }} 本次核销金额
                  </label>
                  <AmountInput
                    :id="`allocation-input-${row.receivableId}`"
                    :ref="(el: unknown) => setRowInputHandle(row.receivableId, el)"
                    v-model="amounts[row.receivableId]"
                    placeholder="0.00"
                    @update:valid="rowValidity[row.receivableId] = $event"
                  />
                </div>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>

        <!-- 移动端（< 768px）：堆叠卡片，核销操作可直接完成 -->
        <div v-else class="flex flex-col gap-3" data-testid="allocation-cards">
          <div
            v-for="row in openRows"
            :key="row.receivableId"
            class="flex flex-col gap-2 rounded-panel border p-3"
            :class="row.receivableId === targetReceivableId ? 'border-brand bg-brand-subtle' : 'border-border'"
            :data-testid="`allocation-row-${row.receivableId}`"
          >
            <div class="flex items-center justify-between gap-2">
              <DocumentNumber :value="row.statementNo" />
              <span class="text-caption text-text-muted">{{ row.accountingMonth }}</span>
            </div>
            <dl class="grid grid-cols-2 gap-x-3 gap-y-1">
              <div class="flex items-center justify-between gap-2">
                <dt class="text-caption text-text-muted">到期日期</dt>
                <dd class="text-table text-text-primary">{{ row.dueDate ?? '—' }}</dd>
              </div>
              <div class="flex items-center justify-between gap-2">
                <dt class="text-caption text-text-muted">应收金额</dt>
                <dd><MoneyText :value="row.originalAmount" size="table" align="left" /></dd>
              </div>
              <div class="flex items-center justify-between gap-2">
                <dt class="text-caption text-text-muted">已收</dt>
                <dd><MoneyText :value="row.paidAmount" size="table" align="left" /></dd>
              </div>
              <div class="flex items-center justify-between gap-2">
                <dt class="text-caption text-text-muted">当前未收</dt>
                <dd><MoneyText :value="row.outstandingAmount" size="table" align="left" /></dd>
              </div>
            </dl>
            <FormField :id="`allocation-input-${row.receivableId}`" label="本次核销金额">
              <AmountInput
                :id="`allocation-input-${row.receivableId}`"
                :ref="(el: unknown) => setRowInputHandle(row.receivableId, el)"
                v-model="amounts[row.receivableId]"
                placeholder="0.00"
                @update:valid="rowValidity[row.receivableId] = $event"
              />
            </FormField>
          </div>
        </div>
      </div>

      <!-- 实时汇总 -->
      <div
        class="flex flex-wrap items-start gap-x-8 gap-y-3 rounded-control bg-surface-hover px-4 py-3"
        data-testid="allocation-summary"
        aria-live="polite"
      >
        <div class="flex flex-col gap-0.5">
          <span class="text-caption text-text-muted">实际收款</span>
          <span data-testid="summary-actual">
            <MoneyText :value="summaryActual ?? ''" align="left" />
          </span>
        </div>
        <div class="flex flex-col gap-0.5">
          <span class="text-caption text-text-muted">已分配</span>
          <span data-testid="summary-allocated">
            <MoneyText :value="summaryAllocated" align="left" />
          </span>
        </div>
        <div class="flex flex-col gap-0.5">
          <span class="text-caption text-text-muted">未分配</span>
          <span data-testid="summary-unallocated">
            <MoneyText :value="summaryUnallocated" align="left" />
          </span>
        </div>
      </div>

      <!-- 未分配 > 0：禁止确认（预收款规则待 Phase 2） -->
      <div
        v-if="unallocatedPositive"
        class="rounded-control border border-warning bg-warning-subtle px-3 py-2 text-caption text-warning-foreground"
        role="alert"
        data-testid="unallocated-warning"
      >
        未分配金额 <MoneyText :value="summaryUnallocated" size="table" align="left" />。预收款 / 未分配收款规则待
        Phase 2 确认，当前禁止确认收款；请调整核销金额使累计分配等于实际收款金额。
      </div>

      <!-- 实时校验与提交错误 -->
      <ul
        v-if="previewErrors.length > 0"
        class="flex flex-col gap-1 rounded-control border border-danger bg-danger-subtle px-3 py-2"
        role="alert"
        data-testid="allocation-errors"
      >
        <li v-for="(error, index) in previewErrors" :key="`preview-${index}`" class="text-caption text-danger-foreground">
          {{ error.message }}
        </li>
      </ul>

      <ul
        v-if="submitErrors.length > 0"
        class="flex flex-col gap-1 rounded-control border border-danger bg-danger-subtle px-3 py-2"
        role="alert"
        data-testid="submit-errors"
      >
        <template v-for="(error, index) in submitErrors" :key="`submit-${index}`">
          <li class="text-caption text-danger-foreground">{{ error.message }}</li>
          <li
            v-for="(fieldMessage, field) in error.fieldErrors ?? {}"
            :key="`submit-${index}-${field}`"
            class="text-caption text-danger-foreground"
          >
            {{ fieldMessage }}
          </li>
        </template>
      </ul>

      <!-- 提交 -->
      <div class="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
        <p class="mr-auto text-caption text-text-muted">确认后生成收款单 ×1、资金流入流水 ×1 与核销明细，失败零变化。</p>
        <Button
          data-testid="confirm-receipt"
          :disabled="!canConfirm || submitting"
          @click="void onClickConfirm()"
        >
          {{ submitting ? '确认中…' : '确认收款' }}
        </Button>
      </div>
    </div>

    <!-- 提交前确认信息 -->
    <ConfirmDialog
      :open="dialogOpen"
      title="确认收款"
      description="请核对以下回款与核销信息。确认后生成收款单、一条资金流入流水与核销明细（同事务提交）。"
      confirm-text="确认收款"
      cancel-text="返回修改"
      @update:open="dialogOpen = $event"
      @confirm="void onDialogConfirm()"
    >
      <div v-if="confirmSummary !== null" class="flex flex-col gap-3" data-testid="confirm-summary">
        <dl class="grid grid-cols-2 gap-x-4 gap-y-1.5">
          <div class="flex items-center justify-between gap-2">
            <dt class="text-caption text-text-muted">客户</dt>
            <dd class="text-table text-text-primary">{{ confirmSummary.customerName }}</dd>
          </div>
          <div class="flex items-center justify-between gap-2">
            <dt class="text-caption text-text-muted">收款日期</dt>
            <dd class="text-table text-text-primary">{{ confirmSummary.receiptDate }}</dd>
          </div>
          <div class="flex items-center justify-between gap-2">
            <dt class="text-caption text-text-muted">收款账户</dt>
            <dd class="text-table text-text-primary">{{ confirmSummary.accountName }}</dd>
          </div>
          <div class="flex items-center justify-between gap-2">
            <dt class="text-caption text-text-muted">实际收款金额</dt>
            <dd><MoneyText :value="confirmSummary.actualAmount" size="table" align="left" /></dd>
          </div>
          <div class="flex items-center justify-between gap-2">
            <dt class="text-caption text-text-muted">已分配</dt>
            <dd><MoneyText :value="confirmSummary.totalAllocated" size="table" align="left" /></dd>
          </div>
          <div class="flex items-center justify-between gap-2">
            <dt class="text-caption text-text-muted">未分配</dt>
            <dd><MoneyText :value="summaryUnallocated" size="table" align="left" /></dd>
          </div>
        </dl>
        <div v-if="confirmSummary.rows.length > 0" class="flex flex-col gap-1 rounded-control border border-border p-2">
          <p class="text-caption text-text-muted">核销明细</p>
          <div
            v-for="row in confirmSummary.rows"
            :key="row.receivableId"
            class="flex items-center justify-between gap-2"
            :data-testid="`confirm-allocation-${row.receivableId}`"
          >
            <DocumentNumber :value="row.statementNo" />
            <MoneyText :value="row.allocationAmount" size="table" align="left" />
          </div>
        </div>
      </div>
    </ConfirmDialog>
  </section>

  <!-- 成功结果 -->
  <section
    v-if="resultSummary !== null"
    class="flex flex-col gap-4 rounded-panel border border-success bg-success-subtle p-5"
    data-testid="receipt-result"
  >
    <div class="flex items-center gap-2">
      <Check class="size-5 text-success-foreground" aria-hidden="true" />
      <h2 class="text-section-title font-semibold text-success-foreground">回款登记成功</h2>
    </div>
    <dl class="grid grid-cols-2 gap-x-6 gap-y-2 md:grid-cols-4">
      <div class="flex flex-col gap-0.5">
        <dt class="text-caption text-text-muted">收款单</dt>
        <dd data-testid="result-receipt-no"><DocumentNumber :value="resultSummary.receiptNo" /></dd>
      </div>
      <div class="flex flex-col gap-0.5">
        <dt class="text-caption text-text-muted">资金流入流水</dt>
        <dd data-testid="result-transaction-no">
          <DocumentNumber :value="resultSummary.transactionNo ?? '—'" />
        </dd>
      </div>
      <div class="flex flex-col gap-0.5">
        <dt class="text-caption text-text-muted">核销笔数</dt>
        <dd class="text-table text-text-primary" data-testid="result-allocation-count">
          {{ resultSummary.allocationCount }} 笔
        </dd>
      </div>
      <div class="flex flex-col gap-0.5">
        <dt class="text-caption text-text-muted">核销合计</dt>
        <dd>
          <MoneyText :value="resultSummary.totalAllocated" size="table" align="left" />
        </dd>
      </div>
    </dl>
    <p class="text-caption text-text-secondary">
      本笔收款仅产生一条资金流入；核销不产生新的资金流水。金额与状态均由核销明细派生。
    </p>
    <div class="flex flex-wrap items-center gap-2">
      <RouterLink
        v-for="receivableId in resultSummary.receivableIds"
        :key="receivableId"
        :to="`${RECEIVABLES_ROUTE_PATH}/${receivableId}`"
        class="inline-flex h-control items-center rounded-control border border-border bg-surface px-4 text-body font-medium text-brand-foreground hover:bg-surface-hover"
        :data-testid="`result-receivable-link-${receivableId}`"
      >
        查看应收单 {{ statementNoOfResult(receivableId) }}
      </RouterLink>
      <RouterLink
        :to="TREASURY_TRANSACTIONS_ROUTE_PATH"
        class="inline-flex h-control items-center rounded-control border border-border bg-surface px-4 text-body font-medium text-brand-foreground hover:bg-surface-hover"
        data-testid="result-transaction-link"
      >
        查看相关流水
      </RouterLink>
      <Button
        variant="primary"
        data-testid="continue-registration"
        @click="result = null"
      >
        继续登记回款
      </Button>
    </div>
  </section>
</template>
