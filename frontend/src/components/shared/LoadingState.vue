<script setup lang="ts">
import Skeleton from '@/components/ui/skeleton/Skeleton.vue'

const props = withDefaults(defineProps<{ rows?: number; label?: string }>(), { rows: 3, label: '加载中…' })
</script>

<template>
  <div class="flex flex-col gap-3 p-4" role="status" :aria-label="props.label">
    <Skeleton v-for="row in props.rows" :key="row" class="h-9 w-full" />
  </div>
</template>
