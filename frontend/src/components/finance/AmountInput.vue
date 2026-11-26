<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import Input from '@/components/ui/input/Input.vue'
import { toFixedDecimals } from '@/utils/decimal'
import { isValidAmount, normalizeAmount } from '@/utils/money'

/**
 * 金额输入控件（人民币业务金额，DECIMAL(18,2)）。
 *
 * 校验契约：
 * - **空值**：允许为空；是否必填由 `required` / `externalError` 决定。
 * - **必填**：`required` 为 true 时，空值在失焦或 `validate()` 时报错。
 * - **负数**：允许（业务规则决定符号语义），如 '-100.00'。
 * - **输入中间态**：输入过程中允许临时非法文本（如 '1.'、'1,'、'-'），
 *   控件立即标记 invalid 但不展示错误文案；其他非法输入（科学计数法、
 *   非法千分位、超过两位小数等）立即展示错误。
 * - **失焦**：严格校验并归一化为两位小数（'0.5' → '0.50'）；非法输入保留原文并报错。
 * - **提交校验**：调用 `validate()`（或依赖 `update:valid`）后方可提交。
 *   任何非法输入期间 `modelValue` 一律为 ''，**禁止表单提交旧金额**。
 * - 金额比较与计算必须使用 utils/decimal.ts 精确运算，禁止 Number / parseFloat。
 */
const props = withDefaults(
  defineProps<{
    modelValue: string
    placeholder?: string
    disabled?: boolean
    /** 输入控件 id，用于与 FormField 的 label 关联（可访问性） */
    id?: string
    /** 必填：空值失焦/提交时报错 */
    required?: boolean
    /** 外部校验错误信息（如必填），优先于内部错误展示 */
    externalError?: string
  }>(),
  { modelValue: '', placeholder: '0.00', required: false },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'update:valid': [valid: boolean]
}>()

const localText = ref(props.modelValue)
const touched = ref(false)

watch(
  () => props.modelValue,
  (value) => {
    if (normalizeAmount(value) !== normalizeAmount(localText.value)) {
      localText.value = value
    }
  },
)

/** 输入中间态：合法前缀 + 结尾逗号或小数点，暂不报错 */
const INTERMEDIATE_RE = /^-?(\d{1,3}(,\d{3})*|\d*)(,|\.)$/

function isIntermediate(text: string): boolean {
  return text === '' || text === '-' || INTERMEDIATE_RE.test(text)
}

const internalError = computed(() => {
  const text = localText.value.trim()
  if (text === '') {
    return props.required && touched.value ? '请输入金额' : ''
  }
  if (isValidAmount(text)) {
    return ''
  }
  if (isIntermediate(text) && !touched.value) {
    // 输入中间态：未失焦前暂不报错
    return ''
  }
  return '金额格式不正确：仅支持数字、合法千分位与最多两位小数（DECIMAL(18,2)）'
})

const showError = computed(() => Boolean(props.externalError) || internalError.value !== '')

const invalid = computed(() => showError.value)

function applyValue(text: string): void {
  const trimmed = text.trim()
  if (trimmed === '') {
    emit('update:modelValue', '')
    emit('update:valid', !props.required || !touched.value ? true : false)
    return
  }
  const normalized = normalizeAmount(trimmed)
  if (normalized !== null) {
    emit('update:modelValue', normalized)
    emit('update:valid', true)
    return
  }
  // 非法输入：清空 modelValue，禁止表单提交旧金额
  emit('update:modelValue', '')
  emit('update:valid', false)
}

function onInput(value: string): void {
  localText.value = value
  const trimmed = value.trim()
  if (trimmed !== '' && !isValidAmount(trimmed) && isIntermediate(trimmed)) {
    // 输入中间态：不更新 modelValue，等待补全或失焦
    emit('update:modelValue', '')
    emit('update:valid', false)
    return
  }
  applyValue(value)
}

function onBlur(): void {
  touched.value = true
  const normalized = normalizeAmount(localText.value)
  if (normalized !== null) {
    const display = toFixedDecimals(normalized, 2)
    localText.value = display
    emit('update:modelValue', display)
    emit('update:valid', true)
    return
  }
  if (localText.value.trim() === '') {
    emit('update:modelValue', '')
    emit('update:valid', !props.required)
    return
  }
  // 非法输入：保留原文供修正，modelValue 清空并标记无效
  emit('update:modelValue', '')
  emit('update:valid', false)
}

/** 提交前校验：返回是否合法；非法时不产生任何可提交金额 */
function validate(): boolean {
  touched.value = true
  const trimmed = localText.value.trim()
  if (trimmed === '') {
    emit('update:modelValue', '')
    const valid = !props.required
    emit('update:valid', valid)
    return valid
  }
  const normalized = normalizeAmount(trimmed)
  if (normalized !== null) {
    const display = toFixedDecimals(normalized, 2)
    localText.value = display
    emit('update:modelValue', display)
    emit('update:valid', true)
    return true
  }
  emit('update:modelValue', '')
  emit('update:valid', false)
  return false
}

defineExpose({ validate })
</script>

<template>
  <div class="flex flex-col gap-1">
    <Input
      :id="props.id"
      :model-value="localText"
      :placeholder="props.placeholder"
      :disabled="props.disabled"
      :invalid="invalid"
      inputmode="decimal"
      class="amount"
      :aria-label="props.id ? undefined : '金额输入'"
      :aria-describedby="showError ? 'amount-input-error' : undefined"
      @update:model-value="onInput"
      @blur="onBlur"
    />
    <p v-if="showError" id="amount-input-error" class="text-caption text-danger-foreground" role="alert">
      {{ props.externalError || internalError }}
    </p>
  </div>
</template>
