<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'

import Input from '@/components/ui/input/Input.vue'
import { toFixedDecimals } from '@/utils/decimal'
import { isValidAmount, normalizeAmount } from '@/utils/money'

/**
 * 金额输入控件（人民币业务金额，DECIMAL(18,2)）。
 *
 * 三个状态的独立语义：
 * - `touched`：用户已失焦或已触发过校验（`validate()`）——只决定内部错误的展示时机；
 * - `valid`（`update:valid`）：**当前整体可提交** = 内部金额合法（或空且非必填）
 *   且不存在 `externalError`。必填空值无论是否失焦 `valid` 恒为 false；
 *   输入中间态不是合法金额（`valid=false`），只是暂不展示错误；
 * - `showError`：仅决定错误文案是否渲染（`externalError` 与非法输入立即展示；
 *   中间态/必填空值在 `touched` 后展示），与 `valid` 互相独立。
 *
 * 校验契约：
 * - **空值**：允许为空；`required=true` 时 `valid` 恒为 false。
 * - **负数**：允许（业务规则决定符号语义），如 '-100.00'。
 * - **输入中间态**（`1.`、`1,`、`-`）：不展示错误，但不判定为合法金额、不进入 modelValue。
 * - **失焦**：严格校验并归一化两位小数（'0.5' → '0.50'）；非法输入保留原文并报错。
 * - **提交校验**：`validate()` 返回整体合法性（**包含 externalError 判定**，
 *   外部校验不通过时提交被阻断，不会绕过）；非法输入期间 `modelValue` 一律为 ''，
 *   **禁止表单提交旧金额**（合法改非法后旧值立即被清空）。
 * - **外部重置**：父组件赋予新 `modelValue` 时同步输入框并重置 `touched`，错误提示随状态消失；
 *   若需在 `modelValue` 未变化时清除本地草稿（如非法输入残留文本），调用暴露的 `reset()`。
 * - 错误提示 DOM ID 全局唯一（`useId`），`aria-describedby` 仅在错误展示时关联。
 * - **valid 通知契约**：`update:valid` 由统一 watch 负责——初始化立即同步一次当前
 *   `valid`（父组件可感知初始必填空值 invalid），此后仅在 `valid` 变化时通知
 *   （同一状态不重复 emit）；输入、`required`、`externalError` 的动态变化均自动重算并通知。
 * - 金额比较与计算必须使用 utils/decimal.ts 精确运算，禁止 Number / parseFloat。
 */
const props = withDefaults(
  defineProps<{
    modelValue: string
    placeholder?: string
    disabled?: boolean
    /** 输入控件 id，用于与 FormField 的 label 关联（可访问性） */
    id?: string
    /** 必填：空值 valid 恒为 false，失焦后展示错误 */
    required?: boolean
    /** 外部校验错误信息（如必填/业务规则）：存在时 valid 恒为 false，validate() 亦返回 false */
    externalError?: string
  }>(),
  { modelValue: '', placeholder: '0.00', required: false },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'update:valid': [valid: boolean]
}>()

const localText = ref(props.modelValue)
/** 已失焦/已触发校验过（仅决定内部错误展示时机） */
const touched = ref(false)
/** 最近一次由本组件发出的 modelValue，用于区分父组件回显与外部重置 */
const lastEmitted = ref(props.modelValue)
/** 组件实例唯一 ID（错误提示 DOM ID 唯一性保障） */
const generatedId = useId()

const inputId = computed(() => props.id ?? `amount-input-${generatedId}`)
const errorId = computed(() => `${inputId.value}-error`)

/** 输入中间态：合法前缀 + 结尾逗号或小数点，暂不报错 */
const INTERMEDIATE_RE = /^-?(\d{1,3}(,\d{3})*|\d*)(,|\.)$/

type ValueState = 'empty' | 'valid' | 'intermediate' | 'invalid'

const valueState = computed<ValueState>(() => {
  const text = localText.value.trim()
  if (text === '') {
    return 'empty'
  }
  if (isValidAmount(text)) {
    return 'valid'
  }
  return INTERMEDIATE_RE.test(text) || text === '-' ? 'intermediate' : 'invalid'
})

/** 整体可提交：内部合法（或空且非必填）且不存在 externalError */
const valid = computed(() => {
  if (props.externalError) {
    return false
  }
  if (valueState.value === 'valid') {
    return true
  }
  return valueState.value === 'empty' && !props.required
})

const internalError = computed(() => {
  switch (valueState.value) {
    case 'invalid':
      return '金额格式不正确：仅支持数字、合法千分位与最多两位小数（DECIMAL(18,2)）'
    case 'intermediate':
      return touched.value ? '金额格式不完整：请补全为合法金额（如 1.00）' : ''
    case 'empty':
      return props.required && touched.value ? '请输入金额' : ''
    default:
      return ''
  }
})

/** 错误展示（与 valid 独立）：externalError/非法输入立即展示，中间态与必填空值 touched 后展示 */
const showError = computed(() => Boolean(props.externalError) || internalError.value !== '')

const invalid = computed(() => showError.value)

/** 同步 modelValue（合法→规范值；非法/中间态/空→''）；valid 通知由 watch 统一负责 */
function emitModelValue(modelValue: string): void {
  lastEmitted.value = modelValue
  emit('update:modelValue', modelValue)
}

function onInput(value: string): void {
  localText.value = value
  const state = valueState.value
  if (state === 'valid') {
    emitModelValue(normalizeAmount(value.trim()) ?? '')
    return
  }
  // 空值 / 中间态 / 非法：modelValue 一律清空，禁止提交旧金额
  emitModelValue('')
}

function onBlur(): void {
  touched.value = true
  const normalized = normalizeAmount(localText.value)
  if (normalized !== null) {
    const display = toFixedDecimals(normalized, 2)
    localText.value = display
    emitModelValue(display)
    return
  }
  // 非法输入/中间态：保留原文供修正，modelValue 清空并标记无效
  emitModelValue('')
}

/**
 * 提交前校验：返回整体合法性（含 externalError 判定，外部校验不通过即阻断提交）。
 * 非法/中间态/必填空值不产生任何可提交金额。
 */
function validate(): boolean {
  touched.value = true
  const normalized = normalizeAmount(localText.value)
  if (normalized !== null) {
    const display = toFixedDecimals(normalized, 2)
    localText.value = display
    emitModelValue(display)
    return valid.value
  }
  emitModelValue('')
  return valid.value
}

// 外部表单重置/外部赋值：同步输入框并重置 touched；父组件回显（等于本组件最近发出值）不覆盖用户输入
watch(
  () => props.modelValue,
  (value) => {
    if (value === lastEmitted.value) {
      return
    }
    localText.value = value
    lastEmitted.value = value
    touched.value = false
  },
)

// valid 统一通知：初始化即同步一次（父组件可感知初始必填空值 invalid），
// 之后仅在 valid 变化时通知（同一状态不重复 emit）；
// 输入、required、externalError 的动态变化均经此 watch 覆盖，组件内不再散落手工 emit valid。
watch(valid, (value) => emit('update:valid', value), { immediate: true })

/** 外部表单重置：清除本地草稿与 touched，回到当前 modelValue 状态 */
function reset(): void {
  localText.value = props.modelValue
  lastEmitted.value = props.modelValue
  touched.value = false
}

defineExpose({ validate, reset })
</script>

<template>
  <div class="flex flex-col gap-1">
    <Input
      :id="inputId"
      :model-value="localText"
      :placeholder="props.placeholder"
      :disabled="props.disabled"
      :invalid="invalid"
      inputmode="decimal"
      class="amount"
      :aria-label="props.id ? undefined : '金额输入'"
      :aria-describedby="showError ? errorId : undefined"
      @update:model-value="onInput"
      @blur="onBlur"
    />
    <p v-if="showError" :id="errorId" class="text-caption text-danger-foreground" role="alert">
      {{ props.externalError || internalError }}
    </p>
  </div>
</template>
