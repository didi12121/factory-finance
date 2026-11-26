<script setup lang="ts">
import { computed } from 'vue'

import { cn } from '@/utils/cn'

const props = withDefaults(
  defineProps<{
    modelValue?: string
    placeholder?: string
    disabled?: boolean
    invalid?: boolean
    type?: 'text' | 'number' | 'password' | 'search'
  }>(),
  { modelValue: '', type: 'text' },
)

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const classes = computed(() =>
  cn(
    'h-control w-full rounded-control border bg-surface px-3 text-body text-text-primary',
    'placeholder:text-text-muted focus-visible:border-brand disabled:cursor-not-allowed disabled:opacity-50',
    props.invalid ? 'border-danger' : 'border-border',
  ),
)

function onInput(event: Event): void {
  emit('update:modelValue', (event.target as HTMLInputElement).value)
}
</script>

<template>
  <input
    :type="props.type"
    :value="props.modelValue"
    :placeholder="props.placeholder"
    :disabled="props.disabled"
    :aria-invalid="props.invalid ? 'true' : undefined"
    :class="classes"
    @input="onInput"
  />
</template>
