<script setup lang="ts">
import { Check } from '@lucide/vue'
import { CheckboxIndicator, CheckboxRoot } from 'reka-ui'

const props = defineProps<{
  modelValue?: boolean | 'indeterminate'
  disabled?: boolean
  label?: string
}>()

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
</script>

<template>
  <label class="inline-flex items-center gap-2 text-body text-text-primary">
    <CheckboxRoot
      :model-value="props.modelValue"
      :disabled="props.disabled"
      class="flex size-[18px] items-center justify-center rounded-[4px] border border-border bg-surface data-[state=checked]:border-brand data-[state=checked]:bg-brand disabled:opacity-50"
      @update:model-value="emit('update:modelValue', $event === true)"
    >
      <CheckboxIndicator class="flex items-center justify-center">
        <Check class="size-3.5 text-white" />
      </CheckboxIndicator>
    </CheckboxRoot>
    <span v-if="props.label">{{ props.label }}</span>
    <slot />
  </label>
</template>
