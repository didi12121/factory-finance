<script setup lang="ts">
import { X } from '@lucide/vue'
import { DialogClose, DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'

import Button from '@/components/ui/button/Button.vue'

const props = defineProps<{
  open: boolean
  title: string
  description?: string
}>()

const emit = defineEmits<{ 'update:open': [value: boolean] }>()
</script>

<template>
  <DialogRoot :open="props.open" @update:open="emit('update:open', $event)">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-40 bg-text-primary/40" />
      <DialogContent
        class="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-32px)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-panel border border-border bg-surface p-6 shadow-lg"
      >
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <DialogTitle class="text-section-title font-semibold text-text-primary">
              {{ props.title }}
            </DialogTitle>
            <DialogDescription v-if="props.description" class="mt-1 text-body text-text-secondary">
              {{ props.description }}
            </DialogDescription>
          </div>
          <DialogClose as-child>
            <Button variant="ghost" size="icon" aria-label="关闭对话框">
              <X class="size-4" />
            </Button>
          </DialogClose>
        </div>

        <div class="mt-4">
          <slot />
        </div>

        <div v-if="$slots.footer" class="mt-6 flex justify-end gap-2">
          <slot name="footer" />
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
