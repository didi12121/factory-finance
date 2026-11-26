<script setup lang="ts">
import { computed } from 'vue'

import { cn } from '@/utils/cn'
import { formatAmount } from '@/utils/money'

const props = withDefaults(
  defineProps<{
    /** 十进制金额字符串，禁止传入已千分位格式化的文本参与计算 */
    value: string
    size?: 'table' | 'body' | 'metric' | 'metric-lg'
    /** 为 true 时负数以 danger 色显示 */
    negativeTone?: boolean
  }>(),
  { size: 'body', negativeTone: false },
)

const formatted = computed(() => {
  try {
    return formatAmount(props.value)
  } catch {
    return '—'
  }
})

const isNegative = computed(() => formatted.value.startsWith('-'))

const sizeClass = computed(() => {
  switch (props.size) {
    case 'table':
      return 'text-table'
    case 'metric':
      return 'text-metric font-semibold'
    case 'metric-lg':
      return 'text-metric-lg font-semibold'
    default:
      return 'text-body'
  }
})
</script>

<template>
  <span
    :class="
      cn('amount', sizeClass, props.negativeTone && isNegative ? 'text-danger' : 'text-text-primary')
    "
  >
    {{ formatted }}
  </span>
</template>
