<script setup lang="ts">
/**
 * 业务日期输入（YYYY-MM-DD，原生 date 控件）。
 * 共享 Input.vue 仅支持文本类输入，日期控件在本 feature 内补齐；
 * 样式与控件高度/圆角保持 Design System Token（不散落色值）。
 */
const props = defineProps<{
  modelValue: string
  /** 输入控件 id，用于与 FormField label 关联（可访问性） */
  id?: string
  disabled?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

function onInput(event: Event): void {
  emit('update:modelValue', (event.target as HTMLInputElement).value)
}
</script>

<template>
  <input
    type="date"
    :id="props.id"
    :value="props.modelValue"
    :disabled="props.disabled"
    class="h-control w-full rounded-control border border-border bg-surface px-3 text-body text-text-primary focus-visible:border-brand disabled:cursor-not-allowed disabled:opacity-50"
    @input="onInput"
  />
</template>
