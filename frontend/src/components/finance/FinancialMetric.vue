<script setup lang="ts">
import MoneyText from '@/components/finance/MoneyText.vue'

/**
 * 财务指标：标签 + 核心财务数字 + 辅助信息。
 * 用于经营概览等聚合展示区域，数字使用 28–32px / 600 规范。
 */
const props = defineProps<{
  label: string
  /** 十进制金额字符串 */
  value: string
  caption?: string
}>()
</script>

<template>
  <div class="flex min-w-[180px] flex-col items-start gap-1">
    <p class="text-caption text-text-muted">{{ props.label }}</p>
    <MoneyText :value="props.value" size="metric" align="left" />
    <p v-if="props.caption" class="text-caption text-text-secondary">{{ props.caption }}</p>
    <slot name="extra" />
  </div>
</template>
