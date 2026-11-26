<script setup lang="ts">
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuTrigger,
} from 'reka-ui'

const props = defineProps<{
  items: { label: string; danger?: boolean; disabled?: boolean; onSelect?: () => void }[]
}>()
</script>

<template>
  <DropdownMenuRoot>
    <DropdownMenuTrigger as-child>
      <slot name="trigger" />
    </DropdownMenuTrigger>

    <DropdownMenuPortal>
      <DropdownMenuContent
        class="z-50 min-w-[168px] rounded-panel border border-border bg-surface p-1 shadow-lg"
        :side-offset="4"
      >
        <DropdownMenuItem
          v-for="(item, index) in props.items"
          :key="index"
          :disabled="item.disabled"
          class="flex h-9 cursor-pointer items-center rounded-control px-2 text-body outline-none select-none data-[highlighted]:bg-surface-hover data-[disabled]:opacity-50"
          :class="item.danger ? 'text-danger' : 'text-text-primary'"
          @select="item.onSelect?.()"
        >
          {{ item.label }}
        </DropdownMenuItem>
        <slot name="extra" />
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>
