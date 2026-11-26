<script setup lang="ts">
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from 'reka-ui'

const props = defineProps<{
  items: { value: string; label: string }[]
  modelValue: string
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <TabsRoot :model-value="props.modelValue" @update:model-value="emit('update:modelValue', String($event))">
    <TabsList class="flex gap-1 border-b border-border">
      <TabsTrigger
        v-for="item in props.items"
        :key="item.value"
        :value="item.value"
        class="-mb-px border-b-2 border-transparent px-3 py-2 text-body text-text-secondary data-[state=active]:border-brand data-[state=active]:font-medium data-[state=active]:text-text-primary"
      >
        {{ item.label }}
      </TabsTrigger>
    </TabsList>

    <TabsContent v-for="item in props.items" :key="item.value" :value="item.value" class="mt-4">
      <slot :name="item.value" />
    </TabsContent>
  </TabsRoot>
</template>
