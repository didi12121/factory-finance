<script setup lang="ts">
import { computed } from 'vue'

import { X } from '@lucide/vue'

import Button from '@/components/ui/button/Button.vue'
import { useToast, type ToastMessage } from '@/components/ui/toast/useToast'
import { cn } from '@/utils/cn'

const { toasts, dismiss } = useToast()

function variantClasses(variant: ToastMessage['variant']): string {
  switch (variant) {
    case 'success':
      return 'border-l-success'
    case 'warning':
      return 'border-l-warning'
    case 'danger':
      return 'border-l-danger'
    default:
      return 'border-l-brand'
  }
}

const toastList = computed(() => toasts.value)
</script>

<template>
  <Teleport to="body">
    <div
      class="pointer-events-none fixed right-4 bottom-4 z-[100] flex w-[calc(100vw-32px)] max-w-sm flex-col gap-2"
      aria-live="polite"
    >
      <div
        v-for="toast in toastList"
        :key="toast.id"
        role="status"
        :class="cn('pointer-events-auto rounded-panel border border-border border-l-4 bg-surface p-4 shadow-lg', variantClasses(toast.variant))"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-body font-medium text-text-primary">{{ toast.title }}</p>
            <p v-if="toast.description" class="mt-0.5 text-caption text-text-secondary">
              {{ toast.description }}
            </p>
          </div>
          <Button variant="ghost" size="icon" aria-label="关闭通知" @click="dismiss(toast.id)">
            <X class="size-4" />
          </Button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
