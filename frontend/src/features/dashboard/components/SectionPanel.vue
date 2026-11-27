<script setup lang="ts">
/**
 * 通用区块面板：标题 + 可选操作 + 内容。
 * 克制的企业级面板（细边框、留白、无大面积阴影），用于经营概览各区块。
 */
const props = withDefaults(
  defineProps<{
    title: string
    description?: string
    /** 内容区去掉内边距（用于填充型内容，如指标条/图表贴边） */
    flush?: boolean
  }>(),
  { description: '', flush: false },
)
</script>

<template>
  <section class="rounded-panel border border-border bg-surface">
    <header class="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
      <div class="min-w-0">
        <h2 class="text-section-title font-semibold text-text-primary">{{ props.title }}</h2>
        <p v-if="props.description" class="mt-0.5 text-caption text-text-muted">
          {{ props.description }}
        </p>
      </div>
      <div v-if="$slots.actions" class="flex shrink-0 items-center gap-2">
        <slot name="actions" />
      </div>
    </header>
    <div :class="props.flush ? '' : 'p-5'">
      <slot />
    </div>
  </section>
</template>
