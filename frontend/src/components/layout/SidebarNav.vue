<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router'

import { navGroups } from '@/app/navigation'
import Badge from '@/components/ui/badge/Badge.vue'
import Tooltip from '@/components/ui/tooltip/Tooltip.vue'
import { useAppStore } from '@/stores/app'

const route = useRoute()
const appStore = useAppStore()

function isActive(path: string): boolean {
  return route.path === path
}
</script>

<template>
  <nav class="flex flex-1 flex-col gap-4 overflow-y-auto px-2 py-4" aria-label="主导航">
    <div v-for="group in navGroups" :key="group.label" class="flex flex-col gap-1">
      <p
        v-if="!appStore.sidebarCollapsed"
        class="px-2 text-caption font-medium text-text-muted"
      >
        {{ group.label }}
      </p>

      <RouterLink
        v-for="item in group.items"
        :key="item.path"
        :to="item.path"
        class="flex h-9 items-center gap-2.5 rounded-control px-2 text-body transition-colors"
        :class="
          isActive(item.path)
            ? 'bg-brand-subtle font-medium text-brand'
            : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
        "
        :aria-current="isActive(item.path) ? 'page' : undefined"
        @click="appStore.closeMobileNav()"
      >
        <Tooltip v-if="appStore.sidebarCollapsed" :content="item.label">
          <component :is="item.icon" class="mx-auto size-4 shrink-0" />
        </Tooltip>
        <component :is="item.icon" v-else class="size-4 shrink-0" />
        <span v-if="!appStore.sidebarCollapsed" class="min-w-0 flex-1 truncate">{{ item.label }}</span>
        <Badge v-if="!appStore.sidebarCollapsed && !item.implemented" variant="muted" class="shrink-0">
          未实现
        </Badge>
      </RouterLink>
    </div>
  </nav>
</template>
