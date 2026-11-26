import { defineStore } from 'pinia'
import { ref } from 'vue'

/** 应用级 UI 状态：侧边栏折叠与移动端导航抽屉 */
export const useAppStore = defineStore('app', () => {
  const sidebarCollapsed = ref(false)
  const mobileNavOpen = ref(false)

  function toggleSidebar(): void {
    sidebarCollapsed.value = !sidebarCollapsed.value
  }

  function openMobileNav(): void {
    mobileNavOpen.value = true
  }

  function closeMobileNav(): void {
    mobileNavOpen.value = false
  }

  return { sidebarCollapsed, mobileNavOpen, toggleSidebar, openMobileNav, closeMobileNav }
})
