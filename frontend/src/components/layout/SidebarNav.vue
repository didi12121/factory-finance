<script setup lang="ts">
/**
 * 侧边主导航。
 *
 * - 已实现原型页正常可访问；未实现项为占位页（页面明确标注尚未实现），
 *   导航项以克制的禁用样式（muted 文字）呈现；整组未实现时分组级仅一次
 *   「规划中」muted 标注（替代逐项重复的「未实现」标签噪音）；
 * - 当前页高亮；详情子路由高亮父级导航（/business/receivables/:id → 应收账款）；
 * - 折叠态保留图标 + Tooltip；移动端抽屉复用本组件。
 */
import { RouterLink, useRoute } from 'vue-router'

import { navGroups, type NavItem } from '@/app/navigation'
import Tooltip from '@/components/ui/tooltip/Tooltip.vue'
import { useAppStore } from '@/stores/app'

const route = useRoute()
const appStore = useAppStore()

/** 当前页或详情子路由高亮父级导航（精确匹配或严格前缀 /path/） */
function isActive(item: NavItem): boolean {
  return route.path === item.path || route.path.startsWith(`${item.path}/`)
}
</script>

<template>
  <nav class="flex flex-1 flex-col gap-4 overflow-y-auto px-2 py-4" aria-label="主导航">
    <div v-for="group in navGroups" :key="group.label" class="flex flex-col gap-1">
      <div v-if="!appStore.sidebarCollapsed" class="flex items-center gap-2 px-2">
        <p class="text-caption font-medium text-text-muted">{{ group.label }}</p>
        <!-- 整组未实现：分组级一次「规划中」标注（克制、不重复） -->
        <span v-if="group.items.every((item) => !item.implemented)" class="text-caption text-text-muted">
          规划中
        </span>
      </div>

      <RouterLink
        v-for="item in group.items"
        :key="item.path"
        :to="item.path"
        class="flex h-9 items-center gap-2.5 rounded-control px-2 text-body transition-colors"
        :class="
          isActive(item)
            ? 'bg-brand-subtle font-medium text-brand-foreground'
            : item.implemented
              ? 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
              : 'text-text-muted hover:bg-surface-hover'
        "
        :aria-current="isActive(item) ? 'page' : undefined"
        @click="appStore.closeMobileNav()"
      >
        <Tooltip v-if="appStore.sidebarCollapsed" :content="item.label">
          <component :is="item.icon" class="mx-auto size-4 shrink-0" />
        </Tooltip>
        <component :is="item.icon" v-else class="size-4 shrink-0" />
        <span v-if="!appStore.sidebarCollapsed" class="min-w-0 flex-1 truncate">{{ item.label }}</span>
      </RouterLink>
    </div>
  </nav>
</template>
