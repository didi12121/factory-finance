<script setup lang="ts">
/**
 * 业务表单对话框（schema 驱动，业务无关）。
 *
 * - 字段类型：text / select / amount（AmountInput）/ date（BusinessDateInput）；
 * - 校验分工：控件级校验由金额/日期组件负责（非法值不进入 modelValue）；
 *   语义校验与后端字段错误由父组件写入 `errors`，本组件只负责展示；
 * - 提交由父组件处理（submit 事件），submitting 期间禁用按钮防重复提交。
 */
import AmountInput from '@/components/finance/AmountInput.vue'
import FormField from '@/components/shared/FormField.vue'
import Button from '@/components/ui/button/Button.vue'
import { BusinessDateInput } from '@/components/ui/date'
import Dialog from '@/components/ui/dialog/Dialog.vue'
import Input from '@/components/ui/input/Input.vue'
import Select from '@/components/ui/select/Select.vue'
import { todayLocalDate } from '@/utils/localDate'

/** 表单字段定义 */
export interface FormFieldSchema {
  key: string
  label: string
  type: 'text' | 'select' | 'amount' | 'date'
  required?: boolean
  placeholder?: string
  hint?: string
  options?: { label: string; value: string; disabled?: boolean }[]
  disabled?: boolean
}

const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    description?: string
    fields: FormFieldSchema[]
    /** 字段值（DecimalString/文本/枚举值；空串表示未填） */
    modelValue: Record<string, string>
    /** 字段级错误（语义校验 + 后端 fieldErrors） */
    errors?: Record<string, string>
    submitting?: boolean
    submitText?: string
  }>(),
  { errors: () => ({}), submitting: false, submitText: '提交' },
)

const emit = defineEmits<{
  'update:open': [value: boolean]
  'update:modelValue': [value: Record<string, string>]
  submit: []
}>()

const today = todayLocalDate()

function fieldValue(key: string): string {
  return props.modelValue[key] ?? ''
}

function setFieldValue(key: string, value: string): void {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}

function onSubmit(): void {
  if (props.submitting) {
    return
  }
  emit('submit')
}
</script>

<template>
  <Dialog :open="props.open" :title="props.title" :description="props.description" @update:open="emit('update:open', $event)">
    <form class="flex flex-col gap-4" :data-testid="`${props.title}-form`" @submit.prevent="onSubmit">
      <FormField
        v-for="field in props.fields"
        :id="`form-${field.key}`"
        :key="field.key"
        :label="field.label"
        :required="field.required ?? false"
        :hint="field.hint"
        :error="props.errors[field.key]"
      >
        <Input
          v-if="field.type === 'text'"
          :id="`form-${field.key}`"
          :model-value="fieldValue(field.key)"
          :placeholder="field.placeholder"
          :disabled="field.disabled ?? props.submitting"
          :invalid="Boolean(props.errors[field.key])"
          :aria-label="field.label"
          @update:model-value="setFieldValue(field.key, $event)"
        />
        <Select
          v-else-if="field.type === 'select'"
          :id="`form-${field.key}`"
          :model-value="fieldValue(field.key)"
          :options="field.options ?? []"
          :placeholder="field.placeholder"
          :disabled="field.disabled ?? props.submitting"
          :invalid="Boolean(props.errors[field.key])"
          :aria-label="field.label"
          @update:model-value="setFieldValue(field.key, $event)"
        />
        <AmountInput
          v-else-if="field.type === 'amount'"
          :id="`form-${field.key}`"
          :model-value="fieldValue(field.key)"
          :required="field.required ?? false"
          :disabled="field.disabled ?? props.submitting"
          :external-error="props.errors[field.key]"
          @update:model-value="setFieldValue(field.key, $event)"
        />
        <BusinessDateInput
          v-else
          :id="`form-${field.key}`"
          :model-value="fieldValue(field.key)"
          :required="field.required ?? false"
          :disabled="field.disabled ?? props.submitting"
          :invalid="Boolean(props.errors[field.key])"
          :max="today"
          :aria-label="field.label"
          @update:model-value="setFieldValue(field.key, $event)"
        />
      </FormField>
    </form>

    <template #footer>
      <Button variant="secondary" :disabled="props.submitting" @click="emit('update:open', false)">取消</Button>
      <Button :disabled="props.submitting" data-testid="form-submit" @click="onSubmit">
        {{ props.submitting ? '提交中…' : props.submitText }}
      </Button>
    </template>
  </Dialog>
</template>
