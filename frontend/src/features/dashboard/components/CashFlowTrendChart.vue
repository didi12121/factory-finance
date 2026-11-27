<script setup lang="ts">
/**
 * 资金收付趋势（IN/OUT 区分柱状图）。
 * - 时间刻度（日期轴）+ 金额 tooltip（格式化字符串）；
 * - 空数据用 EmptyState；随日期筛选更新；
 * - 金额几何值在图表边界转 Number（仅 ECharts），tooltip 用格式化字符串。
 */
import { computed, ref } from 'vue'

import EmptyState from '@/components/shared/EmptyState.vue'
import type { CashFlowTrendPoint } from '@/features/prototype/contracts'
import { buildTrendData, buildTrendOption } from '../chartData'
import { resolveChartPalette } from '../charts/palette'
import { useECharts } from '../charts/useECharts'

const props = defineProps<{ trend: CashFlowTrendPoint[] }>()

const palette = resolveChartPalette()
const chartEl = ref<HTMLElement | null>(null)
const data = computed(() => buildTrendData(props.trend))
const option = computed(() => (data.value.hasData ? buildTrendOption(data.value, palette) : null))

useECharts(chartEl, option)
</script>

<template>
  <EmptyState
    v-if="!data.hasData"
    title="暂无收付数据"
    description="所选日期范围内没有实际资金收付记录。"
  />
  <div
    v-else
    ref="chartEl"
    class="h-[280px] w-full"
    role="img"
    aria-label="资金收付趋势图（流入与流出按日）"
    data-testid="trend-chart"
    :data-points="data.dates.length"
  />
</template>
