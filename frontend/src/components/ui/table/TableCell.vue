<script setup lang="ts">
import { computed } from 'vue'

import { cn } from '@/utils/cn'

const props = withDefaults(defineProps<{ align?: 'left' | 'center' | 'right' }>(), { align: 'left' })

const classes = computed(() =>
  cn(
    'h-table-row px-3 text-table text-text-primary',
    props.align === 'right' && 'text-right',
    props.align === 'center' && 'text-center',
  ),
)
</script>

<template>
  <td :class="classes">
    <slot />
  </td>
</template>
