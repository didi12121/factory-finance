<script setup lang="ts">
import { computed } from 'vue'

import { cn } from '@/utils/cn'

const props = withDefaults(defineProps<{ align?: 'left' | 'center' | 'right' }>(), { align: 'left' })

// 左对齐显式使用 text-left，与表头保持一致
const classes = computed(() =>
  cn(
    'h-table-row px-3 text-table text-text-primary',
    props.align === 'right' ? 'text-right' : props.align === 'center' ? 'text-center' : 'text-left',
  ),
)
</script>

<template>
  <td :class="classes">
    <slot />
  </td>
</template>
