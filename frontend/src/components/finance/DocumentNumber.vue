<script setup lang="ts">
/**
 * 业务单据编号展示（等宽、可复制、不换行）。
 * - `link`：编号本身可点击时使用链接视觉（语义前景色 + 悬停下划线），
 *   点击载体（RouterLink/按钮）由调用方提供，本组件只负责可点击视觉；
 * - 金额/编号均为展示层格式化，不参与财务运算。
 */
import { computed } from 'vue'

import { cn } from '@/utils/cn'

const props = withDefaults(defineProps<{ value: string; link?: boolean }>(), { link: false })

const classes = computed(() =>
  cn(
    'tabular text-table whitespace-nowrap',
    props.link ? 'text-brand-foreground hover:underline' : 'text-text-secondary',
  ),
)
</script>

<template>
  <span :class="classes" :title="props.value">{{ props.value }}</span>
</template>
