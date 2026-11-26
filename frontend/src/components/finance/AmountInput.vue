<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import Input from '@/components/ui/input/Input.vue'
import { normalizeAmount, toFixedDecimals } from '@/utils/decimal'

/**
 * 金额输入控件。
 *
 * - 校验金额格式与精度（最多两位小数）
 * - 禁止科学计数法与非法字符
 * - 输入过程允许中间态（如 "1."），失焦时归一化为规范十进制字符串
 * - 任何运算必须基于规范化字符串（utils/decimal.ts），不依赖 JS Number
 */
const props = withDefaults(
  defineProps<{
    modelValue: string
    placeholder?: string
    disabled?: boolean
    /** 输入控件 id，用于与 FormField 的 label 关联（可访问性） */
    id?: string
    /** 外部校验错误信息（如必填） */
    externalError?: string
  }>(),
  { modelValue: '', placeholder: '0.00' },
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

const internalError = computed(() => {
  const text = localText.value.trim()
  if (text === '') {
    return ''
  }
  return normalizeAmount(text) === null ? '金额格式不正确：仅支持数字与最多两位小数' : ''
})

const showError = computed(() => (touched.value || props.externalError) && (props.externalError || internalError.value))

const invalid = computed(() => Boolean(showError.value))

function onInput(value: string): void {
  localText.value = value
  touched.value = true
  const normalized = value.trim() === '' ? '' : normalizeAmount(value)
  if (normalized !== null) {
    emit('update:modelValue', normalized)
  }
  emit('update:valid', value.trim() === '' || normalized !== null)
}

function onBlur(): void {
  touched.value = true
  const normalized = normalizeAmount(localText.value)
  if (normalized !== null) {
    // 展示层统一为两位小数
    const display = toFixedDecimals(normalized, 2)
    localText.value = display
    emit('update:modelValue', display)
    emit('update:valid', true)
  } else if (localText.value.trim() === '') {
    emit('update:modelValue', '')
    emit('update:valid', true)
  } else {
    emit('update:valid', false)
  }
}
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
      @update:model-value="onInput"
      @blur="onBlur"
    />
    <p v-if="showError" class="text-caption text-danger" role="alert">
      {{ props.externalError || internalError }}
    </p>
  </div>
</template>
