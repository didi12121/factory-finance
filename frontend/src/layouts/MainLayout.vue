<script setup lang="ts">
import { X } from '@lucide/vue'

import AppHeader from '@/components/layout/AppHeader.vue'
import AppSidebar from '@/components/layout/AppSidebar.vue'
import SidebarNav from '@/components/layout/SidebarNav.vue'
import Button from '@/components/ui/button/Button.vue'
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()
</script>

<template>
  <!-- overflow-x-clip：禁止页面级横向滚动（表格等宽内容在自身容器内滚动）；
       clip 不创建滚动容器，不影响 sticky 头部与内部 overflow-x-auto -->
  <div class="flex min-h-screen overflow-x-clip bg-background">
    <AppSidebar />

    <!-- 移动端抽屉导航 -->
    <Teleport to="body">
      <div
        v-if="appStore.mobileNavOpen"
        class="fixed inset-0 z-50 bg-text-primary/40 lg:hidden"
        data-testid="mobile-nav-overlay"
        @click="appStore.closeMobileNav()"
      >
        <aside
          class="flex h-full w-[264px] flex-col border-r border-border bg-surface"
          data-testid="mobile-nav"
          @click.stop
        >
          <div class="flex h-header items-center justify-between border-b border-border px-3">
            <p class="text-body font-semibold text-text-primary">工厂财务</p>
            <Button variant="ghost" size="icon" aria-label="关闭导航菜单" @click="appStore.closeMobileNav()">
              <X class="size-4" />
            </Button>
          </div>
          <SidebarNav />
        </aside>
      </div>
    </Teleport>

    <div class="flex min-w-0 flex-1 flex-col">
      <AppHeader />
      <main class="mx-auto w-full max-w-[1600px] flex-1 px-6 py-6">
        <RouterView />
      </main>
    </div>
  </div>
</template>
