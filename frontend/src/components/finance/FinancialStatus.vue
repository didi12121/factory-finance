<script setup lang="ts">
import { computed } from 'vue'

import { cn } from '@/utils/cn'

/**
 * 财务状态标识：文字 + 语义色共同表达状态，不能只通过颜色区分。
 */
const props = withDefaults(
  defineProps<{
    /** 状态文字，必须始终显示 */
    status: string
    kind?: 'default' | 'brand' | 'success' | 'warning' | 'danger' | 'muted'
  }>(),
  { kind: 'default' },
)

const kindClass = computed(() => {
  switch (props.kind) {
    case 'brand':
      return 'bg-brand-subtle text-brand-foreground'
    case 'success':
      return 'bg-success-subtle text-success-foreground'
    case 'warning':
      return 'bg-warning-subtle text-warning-foreground'
    case 'danger':
      return 'bg-danger-subtle text-danger-foreground'
    case 'muted':
      return 'bg-surface-hover text-text-muted'
    default:
      return 'border border-border bg-surface text-text-secondary'
  }
})

const dotClass = computed(() => {
  switch (props.kind) {
    case 'brand':
      return 'bg-brand'
    case 'success':
      return 'bg-success'
    case 'warning':
      return 'bg-warning'
    case 'danger':
      return 'bg-danger'
    case 'muted':
      return 'bg-text-muted'
    default:
      return 'bg-text-secondary'
  }
})
</script>

<template>
  <span :class="cn('inline-flex items-center gap-1.5 rounded-control px-2 py-0.5 text-caption font-medium', kindClass)">
    <span class="size-1.5 rounded-full" :class="dotClass" aria-hidden="true" />
    {{ props.status }}
  </span>
</template>
