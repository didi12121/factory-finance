<script setup lang="ts">
import { computed } from 'vue'

import { cn } from '@/utils/cn'

const props = withDefaults(defineProps<{ align?: 'left' | 'center' | 'right' }>(), { align: 'left' })

// 左对齐显式使用 text-left，与内容保持一致
const classes = computed(() =>
  cn(
    'h-table-header px-3 text-caption font-medium text-text-muted',
    props.align === 'right' ? 'text-right' : props.align === 'center' ? 'text-center' : 'text-left',
  ),
)
</script>

<template>
  <th scope="col" :class="classes">
    <slot />
  </th>
</template>
