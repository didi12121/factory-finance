<script setup lang="ts">
/**
 * 日历选择浮层（reka-ui Popover + Calendar 原语）。
 *
 * - 值模型：业务文本 YYYY-MM-DD（对外），内部桥接 reka-ui DateValue（calendarValue.ts）；
 * - 手动输入由外层文本框负责，本组件只负责「日历选择」；
 * - min/max 以字符串传入（YYYY-MM-DD），越界日期在日历中不可选；
 * - 文案为业务中文；样式只用 Design Token（无渐变/大面积阴影）。
 */
import { computed, ref, watch } from 'vue'

import { CalendarDays, ChevronLeft, ChevronRight } from '@lucide/vue'
import {
  CalendarCell,
  CalendarCellTrigger,
  CalendarGrid,
  CalendarGridBody,
  CalendarGridHead,
  CalendarGridRow,
  CalendarHeadCell,
  CalendarHeader,
  CalendarHeading,
  CalendarNext,
  CalendarPrev,
  CalendarRoot,
  PopoverContent,
  PopoverPortal,
  PopoverRoot,
  PopoverTrigger,
} from 'reka-ui'

import Button from '@/components/ui/button/Button.vue'
import { type DateValue, fromDateValue, toDateValue, todayAnchor } from './calendarValue'

const props = withDefaults(
  defineProps<{
    /** 当前业务日期（YYYY-MM-DD），空串表示未选择 */
    modelValue: string
    min?: string
    max?: string
    disabled?: boolean
    /** 触发按钮可访问名称 */
    triggerLabel?: string
  }>(),
  { disabled: false, triggerLabel: '打开日历' },
)

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const open = ref(false)

const selected = computed<DateValue | null>(() => toDateValue(props.modelValue))
const minValue = computed<DateValue | null>(() => (props.min ? toDateValue(props.min) : null))
const maxValue = computed<DateValue | null>(() => (props.max ? toDateValue(props.max) : null))

/** 日历显示锚点：当前值 → min → max → 本机当前日期（仅展示用，不参与财务派生） */
function anchorValue(): DateValue {
  return selected.value ?? minValue.value ?? maxValue.value ?? todayAnchor()
}

const placeholder = ref<DateValue>(anchorValue())

/**
 * 值绑定集合：reka-ui 日期值在不同声明入口存在名义类型身份差异，
 * 统一经松散对象一次性绑定（运行时值均为真实日期值，仅类型桥接受限）。
 */
const calendarBindings = computed<Record<string, unknown>>(() => ({
  modelValue: selected.value ?? undefined,
  placeholder: placeholder.value,
  minValue: minValue.value ?? undefined,
  maxValue: maxValue.value ?? undefined,
}))

watch(open, (value) => {
  if (value) {
    placeholder.value = anchorValue()
  }
})

function onPlaceholderChange(value: unknown): void {
  placeholder.value = value as unknown as DateValue
}

/** 选中回调（reka-ui DateValue 均可 toString() 得 YYYY-MM-DD）；选中后关闭浮层 */
function onSelect(value: { toString(): string } | undefined): void {
  open.value = false
  if (value === undefined) {
    emit('update:modelValue', '')
    return
  }
  emit('update:modelValue', fromDateValue(value))
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
          <CalendarDays class="size-4 text-text-muted" aria-hidden="true" />
        </slot>
      </Button>
    </PopoverTrigger>

    <PopoverPortal>
      <PopoverContent
        side="bottom"
        align="end"
        :side-offset="4"
        class="z-50 rounded-panel border border-border bg-surface p-3 shadow-lg"
        data-testid="date-picker-popover"
      >
        <CalendarRoot
          v-slot="{ grid, weekDays }"
          v-bind="calendarBindings"
          locale="zh-CN"
          :week-starts-on="1"
          :fixed-weeks="true"
          calendar-label="日历"
          @update:model-value="onSelect"
          @update:placeholder="onPlaceholderChange"
        >
          <CalendarHeader class="flex items-center justify-between gap-2">
            <CalendarPrev
              class="flex size-8 items-center justify-center rounded-control text-text-secondary hover:bg-surface-hover"
              aria-label="上一月"
            >
              <ChevronLeft class="size-4" />
            </CalendarPrev>
            <CalendarHeading class="text-body font-medium text-text-primary" />
            <CalendarNext
              class="flex size-8 items-center justify-center rounded-control text-text-secondary hover:bg-surface-hover"
              aria-label="下一月"
            >
              <ChevronRight class="size-4" />
            </CalendarNext>
          </CalendarHeader>

          <div class="mt-2 flex flex-col gap-y-2">
            <CalendarGrid v-for="month in grid" :key="month.value.toString()" class="w-full border-collapse">
              <CalendarGridHead>
                <CalendarGridRow>
                  <CalendarHeadCell
                    v-for="day in weekDays"
                    :key="day"
                    class="w-9 pb-1 text-caption font-medium text-text-muted"
                  >
                    {{ day }}
                  </CalendarHeadCell>
                </CalendarGridRow>
              </CalendarGridHead>
              <CalendarGridBody>
                <CalendarGridRow
                  v-for="(weekDates, index) in month.rows"
                  :key="`week-${index}`"
                  class="mt-1 flex w-full"
                >
                  <CalendarCell
                    v-for="weekDate in weekDates"
                    :key="weekDate.toString()"
                    :date="weekDate"
                    class="relative flex w-9 justify-center"
                  >
                    <CalendarCellTrigger
                      :day="weekDate"
                      :month="month.value"
                      class="flex size-9 items-center justify-center rounded-control text-table tabular text-text-primary hover:bg-surface-hover data-[selected]:bg-brand-subtle data-[selected]:font-medium data-[selected]:text-brand-foreground data-[disabled]:cursor-not-allowed data-[disabled]:text-text-muted data-[disabled]:opacity-50 data-[outside-month]:text-text-muted"
                    />
                  </CalendarCell>
                </CalendarGridRow>
              </CalendarGridBody>
            </CalendarGrid>
          </div>
        </CalendarRoot>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
