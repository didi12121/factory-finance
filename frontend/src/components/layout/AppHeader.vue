<script setup lang="ts">
import { computed } from 'vue'

import { Menu, UserRound } from '@lucide/vue'
import { useRoute } from 'vue-router'

import Button from '@/components/ui/button/Button.vue'
import { useAppStore } from '@/stores/app'

const route = useRoute()
const appStore = useAppStore()

const pageTitle = computed(() => String(route.meta.title ?? ''))
</script>

<template>
  <header
    class="sticky top-0 z-30 flex h-header items-center justify-between gap-4 border-b border-border bg-surface px-4"
    data-testid="header"
  >
    <div class="flex min-w-0 items-center gap-2">
      <Button
        variant="ghost"
        size="icon"
        class="lg:hidden"
        aria-label="打开导航菜单"
        data-testid="mobile-nav-open"
        @click="appStore.openMobileNav()"
      >
        <Menu class="size-4" />
      </Button>
      <p class="truncate text-body font-medium text-text-primary">{{ pageTitle }}</p>
    </div>

    <!-- 用户区域：本阶段未接入认证，不放置无响应的假交互入口 -->
    <div class="flex items-center gap-2 text-caption text-text-muted">
      <UserRound class="size-4" aria-hidden="true" />
      <span>未接入认证 · 开发环境</span>
    </div>
  </header>
</template>
