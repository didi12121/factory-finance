<script setup lang="ts">
import { cva, type VariantProps } from 'class-variance-authority'

const badgeVariants = cva('inline-flex items-center gap-1 rounded-control px-2 py-0.5 text-caption font-medium', {
  variants: {
    variant: {
      default: 'border border-border bg-surface text-text-secondary',
      brand: 'bg-brand-subtle text-brand-foreground',
      success: 'bg-success-subtle text-success-foreground',
      warning: 'bg-warning-subtle text-warning-foreground',
      danger: 'bg-danger-subtle text-danger-foreground',
      muted: 'bg-surface-hover text-text-muted',
    },
  },
  defaultVariants: { variant: 'default' },
})

type BadgeVariants = VariantProps<typeof badgeVariants>

const props = defineProps<{ variant?: NonNullable<BadgeVariants['variant']> }>()
</script>

<template>
  <span :class="badgeVariants({ variant: props.variant })">
    <slot />
  </span>
</template>
