<script setup lang="ts">
import { TooltipContent, TooltipPortal, TooltipProvider, TooltipRoot, TooltipTrigger } from 'reka-ui'

const props = withDefaults(
  defineProps<{
    content: string
    side?: 'top' | 'bottom' | 'left' | 'right'
  }>(),
  { side: 'top' },
)
</script>

<template>
  <TooltipProvider :delay-duration="200">
    <TooltipRoot>
      <TooltipTrigger as-child>
        <slot />
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent
          :side="props.side"
          :side-offset="4"
          class="z-50 rounded-control bg-text-primary px-2 py-1 text-caption text-white shadow-md"
        >
          {{ props.content }}
        </TooltipContent>
      </TooltipPortal>
    </TooltipRoot>
  </TooltipProvider>
</template>
