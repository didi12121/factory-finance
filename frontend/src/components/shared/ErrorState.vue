<script setup lang="ts">
import { AlertTriangle } from '@lucide/vue'

const props = withDefaults(defineProps<{ title?: string; description?: string }>(), {
  title: '加载失败',
  description: '请求处理失败，请稍后重试。',
})
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center" role="alert">
    <AlertTriangle class="size-8 text-danger" aria-hidden="true" />
    <p class="text-body font-medium text-text-primary">{{ props.title }}</p>
    <p class="max-w-md text-caption text-text-muted">{{ props.description }}</p>
    <div v-if="$slots.actions" class="mt-2">
      <slot name="actions" />
    </div>
  </div>
</template>
