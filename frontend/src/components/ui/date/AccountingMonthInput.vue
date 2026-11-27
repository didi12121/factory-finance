<script setup lang="ts">
/**
 * 会计月份输入（YYYY-MM）—— 统一会计月份组件。
 *
 * 能力：手动输入、月份选择（reka-ui Popover + 年/月网格）、清空、键盘操作、
 * 必填校验、非法月份校验（2026-13 等报错）、min/max 月份限制。
 *
 * 契约同 BusinessDateInput（modelValue 合法才外发、update:valid 即时同步、
 * `invalid` 为外部表单错误标记）；格式提示 DOM ID `${id}-format-hint`，
 * 错误 DOM ID `${id}-input-error`；Store/Domain 校验仍是最终防线。
 */
import { computed, toRef, useAttrs, useId, watch } from 'vue'

import { X } from '@lucide/vue'

import Button from '@/components/ui/button/Button.vue'
import MonthPickerPopover from './MonthPickerPopover.vue'
import { MONTH_FORMAT_LABEL } from './dateText'
import { useDateTextModel } from './useDateTextModel'

defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{
    /** 会计月份文本（YYYY-MM） */
    modelValue: string
    id?: string
    disabled?: boolean
    required?: boolean
    /** 可选月份下界（YYYY-MM） */
    min?: string
    /** 可选月份上界（YYYY-MM） */
    max?: string
    placeholder?: string
    hint?: boolean
    invalid?: boolean
  }>(),
  { disabled: false, required: false, placeholder: '', hint: true, invalid: false },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'update:valid': [valid: boolean]
}>()

const attrs = useAttrs()
const generatedId = useId()
const inputId = computed(() => props.id ?? `accounting-month-${generatedId}`)
const hintId = computed(() => `${inputId.value}-format-hint`)
const errorId = computed(() => `${inputId.value}-input-error`)

const model = useDateTextModel({
  kind: 'month',
  modelValue: toRef(props, 'modelValue'),
  required: toRef(props, 'required'),
  min: toRef(props, 'min'),
  max: toRef(props, 'max'),
  externalInvalid: toRef(props, 'invalid'),
  onChange: (value) => emit('update:modelValue', value),
})

watch(model.valid, (value) => emit('update:valid', value), { immediate: true })

const hintEcho = computed(() => model.localText.value.trim())
const describedBy = computed(() => {
  const ids: string[] = []
  if (props.hint) {
    ids.push(hintId.value)
  }
  if (model.showError.value) {
    ids.push(errorId.value)
  }
  return ids.length > 0 ? ids.join(' ') : undefined
})

function onMonthPick(value: string): void {
  model.setText(value)
}

function onClear(): void {
  model.setText('')
}

defineExpose({
  validate: model.validate,
  reset: model.reset,
})
</script>

<template>
  <div class="flex flex-col gap-1">
    <div class="flex items-center gap-1">
      <input
        v-bind="attrs"
        :id="inputId"
        type="text"
        :value="model.localText.value"
        :placeholder="props.placeholder"
        :disabled="props.disabled"
        :required="props.required"
        :aria-required="props.required ? 'true' : undefined"
        :aria-invalid="model.invalid.value ? 'true' : undefined"
        :aria-describedby="describedBy"
        class="h-control w-full rounded-control border bg-surface px-3 text-body tabular text-text-primary placeholder:text-text-muted focus-visible:border-brand disabled:cursor-not-allowed disabled:opacity-50"
        :class="model.invalid.value ? 'border-danger' : 'border-border'"
        autocomplete="off"
        @input="model.onInput(($event.target as HTMLInputElement).value)"
        @blur="model.onBlur"
      />
      <MonthPickerPopover
        :model-value="props.modelValue"
        :min="props.min"
        :max="props.max"
        :disabled="props.disabled"
        trigger-label="打开月份选择"
        @update:model-value="onMonthPick"
      />
      <Button
        v-if="model.localText.value !== '' && !props.disabled"
        variant="ghost"
        size="icon"
        type="button"
        class="shrink-0"
        aria-label="清空会计月份"
        @click="onClear"
      >
        <X class="size-4 text-text-muted" />
      </Button>
    </div>

    <p v-if="props.hint" :id="hintId" class="whitespace-nowrap text-caption text-text-muted">
      格式 {{ MONTH_FORMAT_LABEL
      }}<template v-if="hintEcho !== ''"> · {{ hintEcho }}</template>
    </p>

    <p v-if="model.showError.value" :id="errorId" class="text-caption text-danger-foreground" role="alert">
      {{ model.errorText.value }}
    </p>
  </div>
</template>
