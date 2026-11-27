<script setup lang="ts">
/**
 * 业务日期输入（YYYY-MM-DD）—— 统一业务日期组件。
 *
 * 能力：手动输入、日历选择（reka-ui Popover + Calendar）、清空、键盘操作、
 * 必填校验、非法日期校验（含闰年：2026-02-30 / 2025-02-29 报错、2024-02-29 通过）、
 * min/max 日期限制；空值语义（如「无到期日期」）由调用方以留空表达。
 *
 * 契约（与 AmountInput 同构）：
 * - modelValue 合法 → 发出规范文本；中间态/非法/空 → 一律发出 ''，禁止表单提交旧日期；
 * - `update:valid` 初始化即同步一次，此后仅在变化时通知；
 * - `invalid` 为外部表单错误标记（样式 + 抑制内部错误重复展示），Store/Domain 校验仍是最终防线；
 * - 格式提示 DOM ID 为 `${id}-format-hint`，错误 DOM ID 为 `${id}-input-error`（避免与
 *   FormField 的 `${id}-error` 冲突）；
 * - 不向用户暴露内部代号（演示基准常量名、ISO 分隔符等开发术语）。
 */
import { computed, toRef, useAttrs, useId, watch } from 'vue'

import { X } from '@lucide/vue'

import Button from '@/components/ui/button/Button.vue'
import CalendarPopover from './CalendarPopover.vue'
import { DATE_FORMAT_LABEL } from './dateText'
import { useDateTextModel } from './useDateTextModel'

defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{
    /** 业务日期文本（YYYY-MM-DD），空串表示未选择 */
    modelValue: string
    /** 输入控件 id（与 FormField label 关联；亦用于提示/错误 DOM ID） */
    id?: string
    disabled?: boolean
    required?: boolean
    /** 可选日期下界（YYYY-MM-DD） */
    min?: string
    /** 可选日期上界（YYYY-MM-DD，如实际收款日期上限由页面传入） */
    max?: string
    placeholder?: string
    /** 是否展示格式提示（格式 YYYY-MM-DD · 回显） */
    hint?: boolean
    /** 外部表单错误存在（样式与错误展示交由表单，避免重复提示） */
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
const inputId = computed(() => props.id ?? `business-date-${generatedId}`)
const hintId = computed(() => `${inputId.value}-format-hint`)
const errorId = computed(() => `${inputId.value}-input-error`)

const model = useDateTextModel({
  kind: 'date',
  modelValue: toRef(props, 'modelValue'),
  required: toRef(props, 'required'),
  min: toRef(props, 'min'),
  max: toRef(props, 'max'),
  externalInvalid: toRef(props, 'invalid'),
  onChange: (value) => emit('update:modelValue', value),
})

// valid 通知契约：初始化即同步一次，此后仅在变化时通知
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

function onCalendarPick(value: string): void {
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
      <CalendarPopover
        :model-value="props.modelValue"
        :min="props.min"
        :max="props.max"
        :disabled="props.disabled"
        trigger-label="打开日历"
        @update:model-value="onCalendarPick"
      />
      <Button
        v-if="model.localText.value !== '' && !props.disabled"
        variant="ghost"
        size="icon"
        type="button"
        class="shrink-0"
        aria-label="清空日期"
        @click="onClear"
      >
        <X class="size-4 text-text-muted" />
      </Button>
    </div>

    <!-- 业务格式提示（YYYY-MM-DD）；有输入时回显业务日期 -->
    <p v-if="props.hint" :id="hintId" class="whitespace-nowrap text-caption text-text-muted">
      格式 {{ DATE_FORMAT_LABEL
      }}<template v-if="hintEcho !== ''"> · {{ hintEcho }}</template>
    </p>

    <p v-if="model.showError.value" :id="errorId" class="text-caption text-danger-foreground" role="alert">
      {{ model.errorText.value }}
    </p>
  </div>
</template>
