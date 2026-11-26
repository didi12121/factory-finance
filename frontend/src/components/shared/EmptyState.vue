<script setup lang="ts">
import { Inbox } from '@lucide/vue'

const props = withDefaults(defineProps<{ title?: string; description?: string }>(), {
  title: '暂无数据',
  description: '',
})
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
    <Inbox class="size-8 text-text-muted" aria-hidden="true" />
    <p class="text-body font-medium text-text-primary">{{ props.title }}</p>
    <p v-if="props.description" class="max-w-md text-caption text-text-muted">{{ props.description }}</p>
    <div v-if="$slots.actions" class="mt-2">
      <slot name="actions" />
    </div>
  </div>
</template>
