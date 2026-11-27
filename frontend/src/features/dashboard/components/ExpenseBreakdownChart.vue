<script setup lang="ts">
/**
 * 支出分类（水平条形图）。空数据用 EmptyState；随日期筛选更新。
 * 金额几何值在图表边界转 Number（仅 ECharts），tooltip 用格式化字符串。
 */
import { computed, ref } from 'vue'

import EmptyState from '@/components/shared/EmptyState.vue'
import type { ExpenseCategoryStat } from '@/features/prototype/contracts'
import { buildExpenseData, buildExpenseOption } from '../chartData'
import { resolveChartPalette } from '../charts/palette'
import { useECharts } from '../charts/useECharts'

const props = defineProps<{ breakdown: ExpenseCategoryStat[] }>()

const palette = resolveChartPalette()
const chartEl = ref<HTMLElement | null>(null)
const data = computed(() => buildExpenseData(props.breakdown))
const option = computed(() => (data.value.hasData ? buildExpenseOption(data.value, palette) : null))

useECharts(chartEl, option)
</script>

<template>
  <EmptyState
    v-if="!data.hasData"
    title="暂无支出数据"
    description="所选日期范围内没有实际支出记录。"
  />
  <div
    v-else
    ref="chartEl"
    class="h-[280px] w-full"
    role="img"
    aria-label="支出分类条形图"
    data-testid="expense-chart"
    :data-categories="data.categories.length"
  />
</template>
