<script setup lang="ts">
const props = defineProps<{ value: string }>()
</script>

<template>
  <span class="tabular text-table text-text-secondary" :title="props.value">{{ props.value }}</span>
</template>
