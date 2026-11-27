<script setup lang="ts">
/**
 * 经营概览 —— 日期范围筛选（相对 DEMO_TODAY）。
 * 预设：本月 / 上月 / 最近 30 天 / 自定义日期范围。
 * 受控组件（v-model: DashboardFilter），改变选择会真实改变统计期间 → 指标与图表。
 */
import { computed } from 'vue'

import { DateRangeInput } from '@/components/ui/date'
import type { DashboardFilter, DashboardPeriodPreset } from '../period'
import { PRESET_LABELS, resolvePeriod } from '../period'

const props = defineProps<{ modelValue: DashboardFilter }>()
const emit = defineEmits<{ 'update:modelValue': [filter: DashboardFilter] }>()

const presets: DashboardPeriodPreset[] = ['thisMonth', 'lastMonth', 'last30Days', 'custom']

const activePeriod = computed(() => resolvePeriod(props.modelValue))
const isCustom = computed(() => props.modelValue.preset === 'custom')

function selectPreset(preset: DashboardPeriodPreset): void {
  emit('update:modelValue', { ...props.modelValue, preset })
}

function updateCustom(field: 'customFrom' | 'customTo', value: string): void {
  emit('update:modelValue', { ...props.modelValue, preset: 'custom', [field]: value })
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-2" data-testid="date-range-filter">
    <div
      class="inline-flex h-control items-center rounded-control border border-border bg-surface"
      role="group"
      aria-label="日期范围预设"
    >
      <button
        v-for="preset in presets"
        :key="preset"
        type="button"
        class="h-full rounded-control px-3 text-table transition-colors"
        :class="
          props.modelValue.preset === preset
            ? 'bg-brand-subtle text-brand-foreground'
            : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
        "
        :aria-pressed="props.modelValue.preset === preset"
        :data-testid="`date-preset-${preset}`"
        @click="selectPreset(preset)"
      >
        {{ PRESET_LABELS[preset] }}
      </button>
    </div>

    <div v-if="isCustom" class="flex items-center gap-2">
      <span class="text-caption text-text-muted">从</span>
      <!-- 统一日期范围组件（区间文本在右侧持续回显，此处不重复格式提示） -->
      <DateRangeInput
        :from="props.modelValue.customFrom"
        :to="props.modelValue.customTo"
        from-test-id="date-custom-from"
        to-test-id="date-custom-to"
        from-aria-label="自定义开始日期"
        to-aria-label="自定义结束日期"
        :hint="false"
        @update:from="updateCustom('customFrom', $event)"
        @update:to="updateCustom('customTo', $event)"
      />
    </div>

    <span class="text-caption text-text-muted tabular" data-testid="date-range-value">
      {{ activePeriod.from }} ~ {{ activePeriod.to }}
    </span>
  </div>
</template>
