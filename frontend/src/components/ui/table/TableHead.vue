<script setup lang="ts">
import { computed } from 'vue'

import { cn } from '@/utils/cn'

const props = withDefaults(defineProps<{ align?: 'left' | 'center' | 'right' }>(), { align: 'left' })

const classes = computed(() =>
  cn(
    'h-table-header px-3 text-caption font-medium text-text-muted',
    props.align === 'right' && 'text-right',
    props.align === 'center' && 'text-center',
  ),
)
</script>

<template>
  <th scope="col" :class="classes">
    <slot />
  </th>
</template>
