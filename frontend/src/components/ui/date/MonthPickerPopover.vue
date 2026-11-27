<script setup lang="ts">
/**
 * 会计月份选择浮层（reka-ui Popover 原语 + 年/月网格）。
 *
 * - 值模型：业务文本 YYYY-MM（对外）；
 * - 年切换 + 12 个月按钮（键盘可聚焦、回车选中）；
 * - min/max 为 YYYY-MM 字符串，越界月份不可选；
 * - 文案为业务中文，样式只用 Design Token。
 */
import { computed, ref, watch } from 'vue'

import { CalendarRange, ChevronLeft, ChevronRight } from '@lucide/vue'
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'

import Button from '@/components/ui/button/Button.vue'

const props = withDefaults(
  defineProps<{
    /** 当前会计月份（YYYY-MM），空串表示未选择 */
    modelValue: string
    min?: string
    max?: string
    disabled?: boolean
    triggerLabel?: string
  }>(),
  { disabled: false, triggerLabel: '打开月份选择' },
)

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const open = ref(false)

const MONTH_LABELS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'] as const

function yearOf(text: string): number | null {
  return /^\d{4}(-\d{2})?$/.test(text) ? Number.parseInt(text.slice(0, 4), 10) : null
}

function currentYear(): number {
  return yearOf(props.modelValue) ?? yearOf(props.min ?? '') ?? yearOf(props.max ?? '') ?? new Date().getFullYear()
}

const viewYear = ref<number>(currentYear())

watch(open, (value) => {
  if (value) {
    viewYear.value = currentYear()
  }
})

const selectedMonth = computed(() => (/^\d{4}-\d{2}$/.test(props.modelValue) ? props.modelValue : ''))

function monthText(monthIndex: number): string {
  return `${viewYear.value}-${String(monthIndex).padStart(2, '0')}`
}

function isDisabled(monthIndex: number): boolean {
  const text = monthText(monthIndex)
  if (props.min !== undefined && props.min !== '' && text < props.min) {
    return true
  }
  return props.max !== undefined && props.max !== '' && text > props.max
}

function select(monthIndex: number): void {
  if (isDisabled(monthIndex)) {
    return
  }
  emit('update:modelValue', monthText(monthIndex))
  open.value = false
}

function shiftYear(delta: number): void {
  viewYear.value += delta
}
</script>

<template>
  <PopoverRoot v-model:open="open">
    <PopoverTrigger as-child>
      <Button
        variant="ghost"
        size="icon"
        class="shrink-0"
        :disabled="props.disabled"
        :aria-label="props.triggerLabel"
        type="button"
      >
        <slot name="trigger-icon">
          <CalendarRange class="size-4 text-text-muted" aria-hidden="true" />
        </slot>
      </Button>
    </PopoverTrigger>

    <PopoverPortal>
      <PopoverContent
        side="bottom"
        align="end"
        :side-offset="4"
        class="z-50 w-64 rounded-panel border border-border bg-surface p-3 shadow-lg"
        data-testid="month-picker-popover"
      >
        <div class="flex items-center justify-between gap-2">
          <Button variant="ghost" size="icon" aria-label="上一年" type="button" @click="shiftYear(-1)">
            <ChevronLeft class="size-4" />
          </Button>
          <p class="text-body font-medium text-text-primary tabular">{{ viewYear }} 年</p>
          <Button variant="ghost" size="icon" aria-label="下一年" type="button" @click="shiftYear(1)">
            <ChevronRight class="size-4" />
          </Button>
        </div>

        <div class="mt-2 grid grid-cols-3 gap-1">
          <button
            v-for="(label, index) in MONTH_LABELS"
            :key="label"
            type="button"
            class="h-9 rounded-control text-table transition-colors"
            :class="
              selectedMonth === monthText(index + 1)
                ? 'bg-brand-subtle font-medium text-brand-foreground'
                : 'text-text-primary hover:bg-surface-hover'
            "
            :disabled="isDisabled(index + 1)"
            :aria-pressed="selectedMonth === monthText(index + 1)"
            @click="select(index + 1)"
          >
            {{ label }}
          </button>
        </div>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
