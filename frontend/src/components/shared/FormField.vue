<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    id: string
    label: string
    hint?: string
    error?: string
    required?: boolean
  }>(),
  { required: false },
)
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label :for="props.id" class="text-table font-medium text-text-primary">
      {{ props.label }}
      <span v-if="props.required" class="text-danger" aria-hidden="true">*</span>
    </label>
    <slot />
    <p v-if="props.error" :id="`${props.id}-error`" class="text-caption text-danger-foreground" role="alert">
      {{ props.error }}
    </p>
    <p v-else-if="props.hint" :id="`${props.id}-hint`" class="text-caption text-text-muted">
      {{ props.hint }}
    </p>
  </div>
</template>
