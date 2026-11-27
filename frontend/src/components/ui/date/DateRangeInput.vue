<script setup lang="ts">
/**
 * 日期范围输入（YYYY-MM-DD 至 YYYY-MM-DD）—— 统一日期区间筛选组件。
 *
 * 由两个业务日期输入（BusinessDateInput）组成：手动输入、日历选择、清空、
 * 键盘操作、非法日期校验、区间顺序校验（开始日期不得晚于结束日期）。
 * 区间语义为闭区间，任一端留空表示该端不限（查询层按 LocalDateRange 语义处理）。
 *
 * 仅做展示层校验；Store/Domain 仍是最终防线。
 */
import { computed, ref, watch } from 'vue'

import BusinessDateInput from './BusinessDateInput.vue'
import { DATE_FORMAT_LABEL } from './dateText'

const props = withDefaults(
  defineProps<{
    /** 开始日期（YYYY-MM-DD），空串表示不限 */
    from: string
    /** 结束日期（YYYY-MM-DD），空串表示不限 */
    to: string
    fromId?: string
    toId?: string
    fromTestId?: string
    toTestId?: string
    fromAriaLabel?: string
    toAriaLabel?: string
    placeholder?: string
    min?: string
    max?: string
    disabled?: boolean
    /** 两侧是否均必填（筛选场景通常为 false） */
    required?: boolean
    hint?: boolean
    invalid?: boolean
  }>(),
  { disabled: false, required: false, hint: true, invalid: false, placeholder: 'YYYY-MM-DD' },
)

const emit = defineEmits<{
  'update:from': [value: string]
  'update:to': [value: string]
  'update:fromValid': [valid: boolean]
  'update:toValid': [valid: boolean]
}>()

const fromValid = ref(true)
const toValid = ref(true)

watch(fromValid, (value) => emit('update:fromValid', value), { immediate: true })
watch(toValid, (value) => emit('update:toValid', value), { immediate: true })

/** 区间顺序校验：两端均为合法日期且开始晚于结束时提示 */
const rangeError = computed(() => {
  if (props.from === '' || props.to === '') {
    return ''
  }
  return props.from > props.to ? '开始日期不得晚于结束日期' : ''
})

const rangeErrorId = computed(() => `${props.fromId ?? 'date-range'}-range-error`)
const describedBy = computed(() => (rangeError.value === '' ? undefined : rangeErrorId.value))
</script>

<template>
  <div class="flex flex-col gap-1" :aria-describedby="describedBy">
    <div class="flex flex-wrap items-center gap-2">
      <BusinessDateInput
        :model-value="props.from"
        :id="props.fromId"
        :min="props.min"
        :max="props.max"
        :disabled="props.disabled"
        :required="props.required"
        :placeholder="props.placeholder"
        :hint="false"
        :invalid="props.invalid"
        :aria-label="props.fromAriaLabel"
        :data-testid="props.fromTestId"
        class="w-[150px] shrink-0"
        @update:model-value="emit('update:from', $event)"
        @update:valid="fromValid = $event"
      />
      <span class="shrink-0 whitespace-nowrap text-caption text-text-muted">至</span>
      <BusinessDateInput
        :model-value="props.to"
        :id="props.toId"
        :min="props.min"
        :max="props.max"
        :disabled="props.disabled"
        :required="props.required"
        :placeholder="props.placeholder"
        :hint="false"
        :invalid="props.invalid"
        :aria-label="props.toAriaLabel"
        :data-testid="props.toTestId"
        class="w-[150px] shrink-0"
        @update:model-value="emit('update:to', $event)"
        @update:valid="toValid = $event"
      />
    </div>

    <!-- 业务格式提示（YYYY-MM-DD 至 YYYY-MM-DD）；有输入时回显区间 -->
    <p v-if="props.hint" class="whitespace-nowrap text-caption text-text-muted">
      格式 {{ DATE_FORMAT_LABEL }} 至 {{ DATE_FORMAT_LABEL
      }}<template v-if="props.from !== '' || props.to !== ''">
        · {{ props.from || '不限' }} 至 {{ props.to || '不限' }}</template>
    </p>

    <p v-if="rangeError !== ''" :id="rangeErrorId" class="text-caption text-danger-foreground" role="alert">
      {{ rangeError }}
    </p>
  </div>
</template>
