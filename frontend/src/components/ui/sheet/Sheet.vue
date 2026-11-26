<script setup lang="ts">
import { computed } from 'vue'

import { X } from '@lucide/vue'
import { DialogClose, DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'

import Button from '@/components/ui/button/Button.vue'
import { cn } from '@/utils/cn'

const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    description?: string
    side?: 'right' | 'left' | 'bottom'
  }>(),
  { side: 'right' },
)

const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const panelClasses = computed(() =>
  cn(
    'fixed z-50 flex flex-col bg-surface shadow-lg',
    props.side === 'right' && 'right-0 top-0 h-full w-full max-w-md border-l border-border',
    props.side === 'left' && 'left-0 top-0 h-full w-full max-w-md border-r border-border',
    props.side === 'bottom' && 'bottom-0 h-auto max-h-[80vh] w-full rounded-t-panel border-t border-border',
  ),
)
</script>

<template>
  <DialogRoot :open="props.open" @update:open="emit('update:open', $event)">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-40 bg-text-primary/40" />
      <DialogContent :class="panelClasses">
        <div class="flex items-start justify-between gap-4 border-b border-border p-5">
          <div class="min-w-0">
            <DialogTitle class="text-section-title font-semibold text-text-primary">
              {{ props.title }}
            </DialogTitle>
            <DialogDescription v-if="props.description" class="mt-1 text-body text-text-secondary">
              {{ props.description }}
            </DialogDescription>
          </div>
          <DialogClose as-child>
            <Button variant="ghost" size="icon" aria-label="关闭详情面板">
              <X class="size-4" />
            </Button>
          </DialogClose>
        </div>

        <div class="flex-1 overflow-y-auto p-5">
          <slot />
        </div>

        <div v-if="$slots.footer" class="flex justify-end gap-2 border-t border-border p-4">
          <slot name="footer" />
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
