<script setup lang="ts">
import { computed } from 'vue'

import { cn } from '@/utils/cn'

const props = withDefaults(defineProps<{ rounded?: boolean }>(), { rounded: true })

const classes = computed(() => cn('animate-pulse bg-surface-hover', props.rounded ? 'rounded-control' : ''))
</script>

<template>
  <div aria-hidden="true" :class="classes" />
</template>
