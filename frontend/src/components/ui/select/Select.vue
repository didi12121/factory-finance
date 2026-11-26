<script setup lang="ts">
import { computed, useAttrs } from 'vue'

import { Check, ChevronDown } from '@lucide/vue'
import {
  SelectContent,
  SelectIcon,
  SelectItem,
  SelectItemIndicator,
  SelectItemText,
  SelectPortal,
  SelectRoot,
  SelectTrigger,
  SelectValue,
  SelectViewport,
} from 'reka-ui'

import { cn } from '@/utils/cn'

defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{
    modelValue?: string
    options: { label: string; value: string; disabled?: boolean }[]
    placeholder?: string
    disabled?: boolean
    invalid?: boolean
  }>(),
  { modelValue: '' },
)

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

// class / id / aria-* 等外部属性统一转发到实际交互元素 SelectTrigger
const attrs = useAttrs()

const triggerClasses = computed(() =>
  cn(
    'flex h-control w-full items-center justify-between gap-2 rounded-control border bg-surface px-3 text-body',
    'placeholder:text-text-muted disabled:cursor-not-allowed disabled:opacity-50',
    props.invalid ? 'border-danger' : 'border-border',
    attrs.class as string,
  ),
)

function onChange(value: string | number): void {
  emit('update:modelValue', String(value))
}
</script>

<template>
  <SelectRoot :model-value="props.modelValue" :disabled="props.disabled" @update:model-value="onChange">
    <SelectTrigger
      v-bind="attrs"
      :class="triggerClasses"
      :aria-invalid="props.invalid ? 'true' : undefined"
    >
      <SelectValue :placeholder="props.placeholder" />
      <SelectIcon>
        <ChevronDown class="size-4 text-text-muted" />
      </SelectIcon>
    </SelectTrigger>

    <SelectPortal>
      <SelectContent
        class="z-50 min-w-[var(--reka-select-trigger-width)] overflow-hidden rounded-panel border border-border bg-surface shadow-lg"
        position="popper"
        :side-offset="4"
      >
        <SelectViewport class="p-1">
          <SelectItem
            v-for="option in props.options"
            :key="option.value"
            :value="option.value"
            :disabled="option.disabled"
            class="flex h-9 cursor-pointer items-center justify-between gap-4 rounded-control px-2 text-body text-text-primary outline-none select-none data-[highlighted]:bg-surface-hover data-[disabled]:opacity-50"
          >
            <SelectItemText>{{ option.label }}</SelectItemText>
            <SelectItemIndicator>
              <Check class="size-4 text-brand-foreground" />
            </SelectItemIndicator>
          </SelectItem>
        </SelectViewport>
      </SelectContent>
    </SelectPortal>
  </SelectRoot>
</template>
