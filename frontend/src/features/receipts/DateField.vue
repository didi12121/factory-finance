<script setup lang="ts">
/**
 * 业务日期输入（YYYY-MM-DD，原生 date 控件）。
 * 共享 Input.vue 仅支持文本类输入，日期控件在本 feature 内补齐；
 * 样式与控件高度/圆角保持 Design System Token（不散落色值）。
 *
 * 展示规范：原生 date 控件可见文本随浏览器 locale（如 mm/dd/yyyy）变化，
 * 无法直接改写；此处以可见辅助文字固定表达业务格式 YYYY-MM-DD
 * （QA F-008：格式提示 + 回显业务日期），并以 aria-describedby 关联。
 */
import { computed, useId } from 'vue'

const props = defineProps<{
  modelValue: string
  /** 输入控件 id，用于与 FormField label 关联（可访问性） */
  id?: string
  disabled?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const generatedId = useId()
const hintId = computed(() => `${props.id ?? `date-field-${generatedId}`}-format-hint`)

function onInput(event: Event): void {
  emit('update:modelValue', (event.target as HTMLInputElement).value)
}
</script>

<template>
  <div class="flex flex-col gap-1">
    <input
      type="date"
      :id="props.id"
      :value="props.modelValue"
      :disabled="props.disabled"
      :aria-describedby="hintId"
      class="h-control w-full rounded-control border border-border bg-surface px-3 text-body text-text-primary focus-visible:border-brand disabled:cursor-not-allowed disabled:opacity-50"
      @input="onInput"
    />
    <!-- 业务格式提示（YYYY-MM-DD）；有值时回显业务日期 -->
    <p :id="hintId" class="whitespace-nowrap text-caption text-text-muted">
      格式 YYYY-MM-DD<template v-if="props.modelValue"> · {{ props.modelValue }}</template>
    </p>
  </div>
</template>
