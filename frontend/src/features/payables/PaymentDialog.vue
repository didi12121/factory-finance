<script setup lang="ts">
/**
 * 登记付款（应付付款 + 多单核销）。
 *
 * 红线：
 * - 本阶段全额核销：付款金额 = Σ 核销金额（不手填，避免未分配付款与预付款）；
 * - 金额控件一律 AmountInput（提交前 validate()），汇总走 sumAmounts（BigInt 定点），
 *   超额输入通过 externalError 阻断（禁止 Number 参与财务运算）；
 * - 确认付款同事务创建付款单 + 资金流出流水 + 核销明细（后端保证）；
 * - 幂等键：同一对话框会话稳定，失败重试复用同一键。
 */
import { computed, reactive, ref, watch } from 'vue'

import AmountInput from '@/components/finance/AmountInput.vue'
import MoneyText from '@/components/finance/MoneyText.vue'
import Button from '@/components/ui/button/Button.vue'
import Dialog from '@/components/ui/dialog/Dialog.vue'
import Input from '@/components/ui/input/Input.vue'
import Select from '@/components/ui/select/Select.vue'
import Table from '@/components/ui/table/Table.vue'
import TableBody from '@/components/ui/table/TableBody.vue'
import TableCell from '@/components/ui/table/TableCell.vue'
import TableHead from '@/components/ui/table/TableHead.vue'
import TableHeader from '@/components/ui/table/TableHeader.vue'
import TableRow from '@/components/ui/table/TableRow.vue'
import { BusinessDateInput } from '@/components/ui/date'
import { useToast } from '@/components/ui/toast/useToast'
import FormField from '@/components/shared/FormField.vue'
import { toBusinessErrors } from '@/features/business/errorMapping'
import { canonicalAmount2, sumAmounts } from '@/features/prototype/domain/amounts'
import { payableApi, type FundAccount, type PayableRecord } from '@/services/api'
import { compareAmounts } from '@/utils/decimal'
import { newIdempotencyKey } from '@/utils/idempotency'
import { todayLocalDate } from '@/utils/localDate'

const props = defineProps<{
  open: boolean
  /** 固定供应商（页面按供应商维度登记付款） */
  supplierId: string
  /** 该供应商可付款的应付单（未结清且非支出单直接支付） */
  payables: PayableRecord[]
  accounts: FundAccount[]
  /** 从列表行进入时的默认核销应付单 */
  initialPayableId: string | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  confirmed: []
}>()

const toast = useToast()

const today = todayLocalDate()
const paymentDate = ref(today)
const accountId = ref('')
const externalRef = ref('')
const remark = ref('')
const amounts = reactive<Record<string, string>>({})
const rowValidity = reactive<Record<string, boolean>>({})
const submitting = ref(false)
const errors = ref<string[]>([])
const idempotencyKey = ref(newIdempotencyKey('fk'))

interface AmountInputHandle {
  validate(): boolean
}

const rowHandles = new Map<string, AmountInputHandle>()

function setRowHandle(id: string, el: unknown): void {
  const handle = el as AmountInputHandle | null
  if (handle === null) {
    rowHandles.delete(id)
  } else {
    rowHandles.set(id, handle)
  }
}

const accountOptions = computed(() =>
  props.accounts
    .filter((account) => account.status === 'ENABLED')
    .map((account) => ({ label: account.name, value: account.id })),
)

watch(
  () => props.open,
  (open) => {
    if (open) {
      resetForm()
    }
  },
  { immediate: true },
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

function resetForm(): void {
  paymentDate.value = today
  externalRef.value = ''
  remark.value = ''
  errors.value = []
  for (const key of Object.keys(amounts)) {
    delete amounts[key]
  }
  for (const key of Object.keys(rowValidity)) {
    delete rowValidity[key]
  }
  idempotencyKey.value = newIdempotencyKey('fk')
  const target =
    props.initialPayableId === null
      ? null
      : (props.payables.find((row) => row.id === props.initialPayableId) ?? null)
  if (target !== null) {
    amounts[target.id] = target.outstandingAmount
  }
}

/** 超额校验：核销金额不得大于该应付单未付余额（金额比较走 BigInt 定点） */
function externalErrorOf(row: PayableRecord): string {
  const raw = (amounts[row.id] ?? '').trim()
  if (raw === '') {
    return ''
  }
  return compareAmounts(raw, row.outstandingAmount) > 0 ? '不能超过未付余额' : ''
}

/** 付款金额 = Σ 已填核销金额（本阶段全额核销） */
const paymentAmount = computed(() =>
  canonicalAmount2(
    sumAmounts(
      Object.entries(amounts)
        .map(([, raw]) => raw.trim())
        .filter((raw) => raw !== ''),
    ),
  ),
)

function onOpenChange(open: boolean): void {
  emit('update:open', open)
}

async function onConfirm(): Promise<void> {
  if (submitting.value) {
    return
  }
  errors.value = []
  if (accountId.value === '') {
    errors.value = ['请选择付款账户']
    return
  }
  if (paymentDate.value === '') {
    errors.value = ['请选择实际付款日期']
    return
  }
  const allocations: { payableId: number; amount: string }[] = []
  let invalid = false
  for (const row of props.payables) {
    const raw = (amounts[row.id] ?? '').trim()
    if (raw === '') {
      continue
    }
    const handle = rowHandles.get(row.id)
    const valid = (handle?.validate() ?? rowValidity[row.id] !== false) && externalErrorOf(row) === ''
    if (!valid) {
      invalid = true
      continue
    }
    allocations.push({ payableId: Number(row.id), amount: raw })
  }
  if (invalid) {
    errors.value = ['存在金额输入错误，请修正后再提交']
    return
  }
  if (allocations.length === 0) {
    errors.value = ['请至少填写一张应付单的核销金额（本阶段不支持未分配付款与预付款）']
    return
  }
  submitting.value = true
  try {
    await payableApi.createPayment({
      supplierId: Number(props.supplierId),
      paymentDate: paymentDate.value,
      accountId: Number(accountId.value),
      amount: paymentAmount.value,
      externalRef: externalRef.value.trim() === '' ? null : externalRef.value.trim(),
      remark: remark.value.trim() === '' ? null : remark.value.trim(),
      allocations,
      idempotencyKey: idempotencyKey.value,
    })
    toast.success('付款已确认', '已同事务生成付款单、资金流出及核销明细。')
    emit('confirmed')
    emit('update:open', false)
  } catch (error) {
    errors.value = toBusinessErrors(error, '付款失败，请稍后重试。').map((item) => item.message)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <Dialog
    :open="props.open"
    title="登记付款"
    description="确认付款后才产生实际资金流出；本阶段要求全额核销（付款金额 = Σ 核销金额）。"
    @update:open="onOpenChange"
  >
    <div class="flex flex-col gap-4">
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField id="payment-date" label="实际付款日期" required>
          <BusinessDateInput v-model="paymentDate" :max="today" aria-label="实际付款日期" />
        </FormField>
        <FormField id="payment-account" label="付款账户" required>
          <Select v-model="accountId" :options="accountOptions" placeholder="请选择资金账户" aria-label="付款账户" />
        </FormField>
        <FormField id="payment-external-ref" label="外部参考号">
          <Input v-model="externalRef" placeholder="选填（如银行流水号）" aria-label="外部参考号" />
        </FormField>
        <FormField id="payment-remark" label="备注">
          <Input v-model="remark" placeholder="选填" aria-label="备注" />
        </FormField>
      </div>

      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between">
          <span class="text-caption text-text-muted">核销明细（应付单 → 本次付款金额）</span>
          <span class="text-caption text-text-secondary">
            付款金额：<MoneyText :value="paymentAmount" size="table" />
          </span>
        </div>
        <div class="rounded-panel border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>应付单号</TableHead>
                <TableHead>业务日期</TableHead>
                <TableHead class="text-right">未付余额</TableHead>
                <TableHead class="w-44">本次付款</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="row in props.payables" :key="row.id" :data-testid="`alloc-row-${row.payableNo}`">
                <TableCell>{{ row.payableNo }}</TableCell>
                <TableCell class="tabular">{{ row.bizDate }}</TableCell>
                <TableCell class="text-right">
                  <MoneyText :value="row.outstandingAmount" size="table" />
                </TableCell>
                <TableCell>
                  <AmountInput
                    :model-value="amounts[row.id] ?? ''"
                    :external-error="externalErrorOf(row)"
                    :ref="(el) => setRowHandle(row.id, el)"
                    @update:model-value="amounts[row.id] = $event"
                    @update:valid="rowValidity[row.id] = $event"
                  />
                </TableCell>
              </TableRow>
              <TableRow v-if="props.payables.length === 0">
                <TableCell :colspan="4" class="text-center text-caption text-text-muted">
                  该供应商暂无可付款的应付单
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>

      <ul v-if="errors.length > 0" class="flex flex-col gap-1" role="alert" data-testid="payment-errors">
        <li v-for="(message, index) in errors" :key="index" class="text-caption text-danger-foreground">
          {{ message }}
        </li>
      </ul>
    </div>

    <template #footer>
      <Button variant="secondary" :disabled="submitting" @click="onOpenChange(false)">取消</Button>
      <Button :disabled="submitting" data-testid="confirm-payment" @click="onConfirm">
        {{ submitting ? '提交中…' : '确认付款' }}
      </Button>
    </template>
  </Dialog>
</template>
