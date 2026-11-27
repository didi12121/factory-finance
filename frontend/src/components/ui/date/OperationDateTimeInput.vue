<script setup lang="ts">
/**
 * 操作时间输入（YYYY-MM-DD HH:mm）—— 统一操作/审计时间组件。
 *
 * 能力：手动输入、日历选择日期部分（reka-ui Popover + Calendar）、清空、键盘操作、
 * 必填校验、非法时间校验（不存在的日期、小时 00-23、分钟 00-59）。
 * 日历选中日期时保留已输入时间部分，未输入时间默认 00:00。
 *
 * 契约同 BusinessDateInput（modelValue 合法才外发、update:valid 即时同步、
 * `invalid` 为外部表单错误标记）；Store/Domain 校验仍是最终防线。
 */
import { computed, ref, toRef, useAttrs, useId, watch } from 'vue'

import { X } from '@lucide/vue'

import Button from '@/components/ui/button/Button.vue'
import CalendarPopover from './CalendarPopover.vue'
import {
  DATE_TIME_FORMAT_LABEL,
  composeDateTimeText,
  dateTimeDatePart,
  dateTimeTimePart,
} from './dateText'
import { useDateTextModel } from './useDateTextModel'

defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{
    /** 操作时间文本（YYYY-MM-DD HH:mm） */
    modelValue: string
    id?: string
    disabled?: boolean
    required?: boolean
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
const inputId = computed(() => props.id ?? `operation-time-${generatedId}`)
const hintId = computed(() => `${inputId.value}-format-hint`)
const errorId = computed(() => `${inputId.value}-input-error`)

const noLimit = ref<string | undefined>(undefined)

const model = useDateTextModel({
  kind: 'dateTime',
  modelValue: toRef(props, 'modelValue'),
  required: toRef(props, 'required'),
  min: noLimit,
  max: noLimit,
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

/** 日历选中日期部分：保留已输入时间部分，未输入默认 00:00 */
function onDatePick(datePart: string): void {
  const timePart = dateTimeTimePart(model.localText.value) || '00:00'
  model.setText(composeDateTimeText(datePart, timePart))
}

function onClear(): void {
  model.setText('')
}

/** 当前日期部分（供日历锚定/回显） */
const datePart = computed(() => dateTimeDatePart(props.modelValue))

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
      <CalendarPopover
        :model-value="datePart"
        :disabled="props.disabled"
        trigger-label="打开日历"
        @update:model-value="onDatePick"
      />
      <Button
        v-if="model.localText.value !== '' && !props.disabled"
        variant="ghost"
        size="icon"
        type="button"
        class="shrink-0"
        aria-label="清空操作时间"
        @click="onClear"
      >
        <X class="size-4 text-text-muted" />
      </Button>
    </div>

    <p v-if="props.hint" :id="hintId" class="whitespace-nowrap text-caption text-text-muted">
      格式 {{ DATE_TIME_FORMAT_LABEL
      }}<template v-if="hintEcho !== ''"> · {{ hintEcho }}</template>
    </p>

    <p v-if="model.showError.value" :id="errorId" class="text-caption text-danger-foreground" role="alert">
      {{ model.errorText.value }}
    </p>
  </div>
</template>
