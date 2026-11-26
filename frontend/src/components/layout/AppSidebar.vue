<script setup lang="ts">
import { PanelLeftClose, PanelLeftOpen } from '@lucide/vue'

import SidebarNav from '@/components/layout/SidebarNav.vue'
import Button from '@/components/ui/button/Button.vue'
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()
</script>

<template>
  <aside
    class="hidden shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-150 lg:flex"
    :class="appStore.sidebarCollapsed ? 'w-sidebar-collapsed' : 'w-sidebar'"
    data-testid="sidebar"
  >
    <div class="flex h-header items-center justify-between gap-2 border-b border-border px-3">
      <div v-if="!appStore.sidebarCollapsed" class="min-w-0">
        <p class="truncate text-body font-semibold text-text-primary">工厂财务</p>
        <p class="truncate text-caption text-text-muted">Factory Finance</p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        :aria-label="appStore.sidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'"
        data-testid="sidebar-toggle"
        @click="appStore.toggleSidebar()"
      >
        <PanelLeftClose v-if="!appStore.sidebarCollapsed" class="size-4" />
        <PanelLeftOpen v-else class="size-4 mx-auto" />
      </Button>
    </div>

    <SidebarNav />
  </aside>
</template>
