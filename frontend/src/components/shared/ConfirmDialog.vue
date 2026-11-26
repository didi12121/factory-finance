<script setup lang="ts">
import Dialog from '@/components/ui/dialog/Dialog.vue'
import Button from '@/components/ui/button/Button.vue'

const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    description?: string
    confirmText?: string
    cancelText?: string
    danger?: boolean
  }>(),
  { confirmText: '确定', cancelText: '取消', danger: false },
)

const emit = defineEmits<{
  'update:open': [value: boolean]
  confirm: []
  cancel: []
}>()

function onCancel(): void {
  emit('cancel')
  emit('update:open', false)
}

function onConfirm(): void {
  emit('confirm')
  emit('update:open', false)
}
</script>

<template>
  <Dialog
    :open="props.open"
    :title="props.title"
    :description="props.description"
    @update:open="emit('update:open', $event)"
  >
    <slot />

    <template #footer>
      <Button variant="secondary" @click="onCancel">{{ props.cancelText }}</Button>
      <Button :variant="props.danger ? 'danger' : 'primary'" @click="onConfirm">{{ props.confirmText }}</Button>
    </template>
  </Dialog>
</template>
