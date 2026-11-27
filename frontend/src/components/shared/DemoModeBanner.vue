<script setup lang="ts">
import { Info } from '@lucide/vue'

/**
 * 统一演示模式提示（核心原型页面顶部使用）。
 * 克制、不遮挡内容；数据为虚构演示数据，页面刷新恢复初始状态。
 */
</script>

<template>
  <div
    class="flex items-center gap-2 rounded-control border border-border bg-surface px-3 py-1.5 text-caption text-text-muted"
    role="note"
    data-testid="demo-mode-banner"
  >
    <Info class="size-3.5 shrink-0 text-brand-foreground" aria-hidden="true" />
    <span>演示模式 · 非真实财务数据</span>
  </div>
</template>
