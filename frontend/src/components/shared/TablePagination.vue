<script setup lang="ts">
import { computed } from 'vue'

import Button from '@/components/ui/button/Button.vue'
import Select from '@/components/ui/select/Select.vue'

const props = withDefaults(
  defineProps<{
    page: number
    pageSize: number
    total: number
    pageSizeOptions?: number[]
  }>(),
  { pageSizeOptions: () => [20, 50, 100] },
)

const emit = defineEmits<{
  'update:page': [page: number]
  'update:pageSize': [size: number]
}>()

const totalPages = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)))

const sizeOptions = computed(() =>
  props.pageSizeOptions.map((size) => ({ label: `${size} 条/页`, value: String(size) })),
)

function onSizeChange(value: string): void {
  emit('update:pageSize', Number(value))
}
</script>

<template>
  <div class="flex flex-wrap items-center justify-between gap-3">
    <p class="text-caption text-text-muted">共 <span class="tabular">{{ props.total }}</span> 条</p>

    <div class="flex flex-wrap items-center gap-3">
      <Select
        :model-value="String(props.pageSize)"
        :options="sizeOptions"
        class="w-[112px] shrink-0"
        @update:model-value="onSizeChange"
      />
      <div class="flex shrink-0 items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          class="whitespace-nowrap"
          :disabled="props.page <= 1"
          aria-label="上一页"
          @click="emit('update:page', props.page - 1)"
        >
          上一页
        </Button>
        <p class="whitespace-nowrap text-caption text-text-secondary">
          第 <span class="tabular">{{ props.page }}</span> / <span class="tabular">{{ totalPages }}</span> 页
        </p>
        <Button
          variant="secondary"
          size="sm"
          class="whitespace-nowrap"
          :disabled="props.page >= totalPages"
          aria-label="下一页"
          @click="emit('update:page', props.page + 1)"
        >
          下一页
        </Button>
      </div>
    </div>
  </div>
</template>
