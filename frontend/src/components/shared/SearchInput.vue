<script setup lang="ts">
import { Search, X } from '@lucide/vue'

import Input from '@/components/ui/input/Input.vue'

const props = withDefaults(defineProps<{ modelValue?: string; placeholder?: string }>(), {
  modelValue: '',
  placeholder: '搜索…',
})

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <div class="relative w-full max-w-xs">
    <Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
    <Input
      :model-value="props.modelValue"
      :placeholder="props.placeholder"
      type="search"
      class="pl-9"
      @update:model-value="emit('update:modelValue', $event)"
    />
    <button
      v-if="props.modelValue"
      type="button"
      class="absolute right-2 top-1/2 -translate-y-1/2 rounded-control p-1 text-text-muted hover:text-text-primary"
      aria-label="清除搜索"
      @click="emit('update:modelValue', '')"
    >
      <X class="size-4" />
    </button>
  </div>
</template>
