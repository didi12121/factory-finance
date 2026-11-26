<script setup lang="ts">
import { computed } from 'vue'

import { cn } from '@/utils/cn'

const props = withDefaults(defineProps<{ orientation?: 'horizontal' | 'vertical' }>(), {
  orientation: 'horizontal',
})

const classes = computed(() =>
  cn('bg-border', props.orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px'),
)
</script>

<template>
  <div role="separator" :aria-orientation="props.orientation" :class="classes" />
</template>
