<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import Badge from '@/components/ui/badge/Badge.vue'
import EmptyState from '@/components/shared/EmptyState.vue'
import PageHeader from '@/components/shared/PageHeader.vue'

const route = useRoute()

const title = computed(() => String(route.meta.title ?? ''))
const phase = computed(() => String(route.meta.phase ?? ''))
const description = computed(() =>
  phase.value
    ? `本页面为规划中的占位页面，计划于 ${phase.value} 阶段实现。Phase 0.1 仅交付工程基础设施、设计系统与应用骨架。`
    : '本页面为规划中的占位页面。',
)
</script>

<template>
  <div class="flex flex-col gap-6">
    <PageHeader :title="title">
      <template #actions>
        <Badge variant="muted">尚未实现</Badge>
      </template>
    </PageHeader>

    <div class="rounded-panel border border-border bg-surface">
      <EmptyState title="该功能尚未实现" :description="description" />
    </div>
  </div>
</template>
