<script setup lang="ts">
import Sheet from '@/components/ui/sheet/Sheet.vue'

const props = defineProps<{
  open: boolean
  title: string
  description?: string
}>()

const emit = defineEmits<{ 'update:open': [value: boolean] }>()
</script>

<template>
  <Sheet
    :open="props.open"
    :title="props.title"
    :description="props.description"
    side="right"
    @update:open="emit('update:open', $event)"
  >
    <slot />
    <template v-if="$slots.footer" #footer>
      <slot name="footer" />
    </template>
  </Sheet>
</template>
