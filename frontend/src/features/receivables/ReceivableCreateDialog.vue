<script setup lang="ts">
/**
 * 新建应收单 Dialog —— Agent F（P02-F）。
 *
 * 红线：
 * - 提交只调用 `usePrototypeStore.createReceivable`（唯一写入口）：
 *   **不增加现金、不建收款单/流水、不自动结清**，成功后列表与指标经 store 响应式即时更新；
 * - 提交前调用 AmountInput `validate()`（UI 校验），store 业务校验为最终防线
 *   （客户/月份/日期/金额>0/唯一编号），BusinessError 的 message/fieldErrors 回显到表单；
 * - 防重复点击：提交期间禁用按钮；金额运算比较禁止 Number/parseFloat。
 */

import { computed, ref } from 'vue'

import Button from '@/components/ui/button/Button.vue'
import Dialog from '@/components/ui/dialog/Dialog.vue'
import Input from '@/components/ui/input/Input.vue'
import Select from '@/components/ui/select/Select.vue'
import { AccountingMonthInput, BusinessDateInput } from '@/components/ui/date'
import { useToast } from '@/components/ui/toast/useToast'
import AmountInput from '@/components/finance/AmountInput.vue'
import FormField from '@/components/shared/FormField.vue'
import type { BusinessError, CreateReceivableCommand } from '@/features/prototype/contracts'
import { isValidAccountingMonth, isValidLocalDate } from '@/features/prototype/domain/dateRules'
import { isPrototypeBusinessError } from '@/features/prototype/repository/prototypeErrors'
import { usePrototypeStore } from '@/features/prototype/stores/prototype'
import { compareAmounts } from '@/utils/decimal'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const store = usePrototypeStore()
const toast = useToast()

/* ---------------------------- 表单状态 ---------------------------- */

const customerId = ref('')
const accountingMonth = ref('')
const statementDate = ref('')
const dueDate = ref('')
const amount = ref('')
const remark = ref('')

const amountInputRef = ref<InstanceType<typeof AmountInput> | null>(null)
/** 业务规则外部错误（如金额 ≤ 0），经 AmountInput externalError 阻断提交 */
const amountExternalError = ref('')
const fieldErrors = ref<Record<string, string>>({})
const formError = ref('')
const submitting = ref(false)

/** 客户选项：启用客户可选；停用客户保留展示但禁用（历史单据保留、新单不可用） */
const customerOptions = computed(() =>
  store.customers.map((item) => ({
    label: item.status === 'ENABLED' ? item.name : `${item.name}（已停用）`,
    value: item.id,
    disabled: item.status !== 'ENABLED',
  })),
)

function resetForm(): void {
  customerId.value = ''
  accountingMonth.value = ''
  statementDate.value = ''
  dueDate.value = ''
  amount.value = ''
  remark.value = ''
  amountExternalError.value = ''
  fieldErrors.value = {}
  formError.value = ''
  amountInputRef.value?.reset()
}

function onOpenChange(open: boolean): void {
  if (!open) {
    resetForm()
  }
  emit('update:open', open)
}

/* ---------------------------- 校验与提交 ---------------------------- */

/** 本地预校验（字段级即时反馈）；store 业务校验仍是最终防线 */
function validateLocal(): boolean {
  const errors: Record<string, string> = {}
  if (customerId.value === '') {
    errors['customerId'] = '请选择客户'
  }
  if (!isValidAccountingMonth(accountingMonth.value)) {
    errors['accountingMonth'] = '所属月份格式非法（应为 YYYY-MM）'
  }
  if (!isValidLocalDate(statementDate.value)) {
    errors['statementDate'] = '对账日期格式非法（应为 YYYY-MM-DD）'
  }
  if (dueDate.value !== '') {
    if (!isValidLocalDate(dueDate.value)) {
      errors['dueDate'] = '到期日格式非法（应为 YYYY-MM-DD）'
    } else if (isValidLocalDate(statementDate.value) && dueDate.value < statementDate.value) {
      errors['dueDate'] = '到期日不得早于对账日期'
    }
  }
  fieldErrors.value = errors
  return Object.keys(errors).length === 0
}

async function onSubmit(): Promise<void> {
  if (submitting.value) {
    return
  }
  formError.value = ''
  amountExternalError.value = ''

  const localOk = validateLocal()
  // 提交前必须调用 AmountInput validate()（触发严格校验与两位小数归一化）
  const amountOk = amountInputRef.value?.validate() ?? false
  if (amount.value !== '' && compareAmounts(amount.value, '0') <= 0) {
    amountExternalError.value = '应收金额必须大于 0'
  }
  if (!localOk || !amountOk || amountExternalError.value !== '') {
    return
  }

  const command: CreateReceivableCommand = {
    customerId: customerId.value,
    accountingMonth: accountingMonth.value,
    statementDate: statementDate.value,
    dueDate: dueDate.value === '' ? null : dueDate.value,
    amount: amount.value,
    remark: remark.value.trim() === '' ? null : remark.value.trim(),
  }

  submitting.value = true
  try {
    const created = await store.createReceivable(command)
    toast.success('应收单已创建', `对账单编号 ${created.statementNo}`)
    resetForm()
    emit('update:open', false)
  } catch (error) {
    if (isPrototypeBusinessError(error)) {
      applyBusinessErrors(error.errors)
    } else {
      formError.value = '创建失败，请稍后重试'
    }
  } finally {
    submitting.value = false
  }
}

/** store 业务校验错误回显（message 顶部汇总，fieldErrors 定位到字段；金额错误走 AmountInput） */
function applyBusinessErrors(errors: BusinessError[]): void {
  const fields: Record<string, string> = {}
  for (const error of errors) {
    for (const [field, message] of Object.entries(error.fieldErrors ?? {})) {
      if (field === 'amount') {
        amountExternalError.value = message
      } else {
        fields[field] = message
      }
    }
    if (fieldErrorsOf(error) === '') {
      formError.value = error.message
    }
  }
  fieldErrors.value = { ...fieldErrors.value, ...fields }
  if (formError.value === '') {
    formError.value = errors.map((item) => item.message).join('；')
  }
}

function fieldErrorsOf(error: BusinessError): string {
  return Object.values(error.fieldErrors ?? {}).join('；')
}
</script>

<template>
  <Dialog
    :open="props.open"
    title="新建应收单"
    description="登记加工费对账应收（不产生资金流水，不自动结清）"
    @update:open="onOpenChange"
  >
    <form class="flex flex-col gap-4" data-testid="create-receivable-form" @submit.prevent="onSubmit">
      <FormField id="create-customer" label="客户" required :error="fieldErrors['customerId']">
        <Select
          v-model="customerId"
          :options="customerOptions"
          placeholder="请选择客户"
          :invalid="Boolean(fieldErrors['customerId'])"
          aria-label="客户"
        />
      </FormField>

      <FormField
        id="create-month"
        label="所属月份"
        required
        hint="格式：YYYY-MM（如 2026-12）"
        :error="fieldErrors['accountingMonth']"
      >
        <AccountingMonthInput
          id="create-month"
          v-model="accountingMonth"
          placeholder="2026-12"
          :invalid="Boolean(fieldErrors['accountingMonth'])"
          :hint="false"
          aria-label="所属月份"
        />
      </FormField>

      <FormField
        id="create-statement-date"
        label="对账日期"
        required
        hint="格式：YYYY-MM-DD（如 2026-12-05）"
        :error="fieldErrors['statementDate']"
      >
        <BusinessDateInput
          id="create-statement-date"
          v-model="statementDate"
          placeholder="2026-12-05"
          :invalid="Boolean(fieldErrors['statementDate'])"
          :hint="false"
          aria-label="对账日期"
        />
      </FormField>

      <FormField
        id="create-due-date"
        label="到期日期"
        hint="格式：YYYY-MM-DD；留空表示未约定到期日（不据此判定逾期）"
        :error="fieldErrors['dueDate']"
      >
        <BusinessDateInput
          id="create-due-date"
          v-model="dueDate"
          placeholder="2026-12-31"
          :invalid="Boolean(fieldErrors['dueDate'])"
          :hint="false"
          aria-label="到期日期"
        />
      </FormField>

      <FormField id="create-amount" label="应收金额" required>
        <AmountInput
          id="create-amount"
          ref="amountInputRef"
          v-model="amount"
          required
          :external-error="amountExternalError"
        />
      </FormField>

      <FormField id="create-remark" label="备注">
        <Input v-model="remark" placeholder="选填" aria-label="备注" />
      </FormField>

      <p v-if="formError" class="text-caption text-danger-foreground" role="alert" data-testid="create-receivable-error">
        {{ formError }}
      </p>

      <div class="flex justify-end gap-2">
        <Button type="button" variant="secondary" @click="onOpenChange(false)">取消</Button>
        <Button type="submit" variant="primary" :disabled="submitting" data-testid="create-receivable-submit">
          {{ submitting ? '提交中…' : '创建应收单' }}
        </Button>
      </div>
    </form>
  </Dialog>
</template>
