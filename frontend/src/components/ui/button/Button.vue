<script setup lang="ts">
import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes } from 'vue'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-control font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-brand text-white hover:bg-brand-hover',
        secondary: 'bg-surface border border-border text-text-primary hover:bg-surface-hover',
        ghost: 'text-text-secondary hover:bg-surface-hover hover:text-text-primary',
        danger: 'bg-danger text-white hover:opacity-90',
      },
      size: {
        default: 'h-control px-4 text-body',
        sm: 'h-8 px-3 text-table',
        icon: 'size-9',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  },
)

type ButtonVariants = VariantProps<typeof buttonVariants>

const props = defineProps<{
  variant?: NonNullable<ButtonVariants['variant']>
  size?: NonNullable<ButtonVariants['size']>
  disabled?: boolean
  type?: ButtonHTMLAttributes['type']
}>()
</script>

<template>
  <button
    :type="props.type ?? 'button'"
    :disabled="props.disabled"
    :class="buttonVariants({ variant: props.variant, size: props.size })"
  >
    <slot />
  </button>
</template>
