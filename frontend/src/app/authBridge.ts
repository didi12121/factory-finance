/**
 * 认证桥接：401 统一登出 + 跳登录（API 层 → 路由/会话的唯一装配点）。
 *
 * 为什么独立模块：`services/api/client` 不导入 store/router（避免循环依赖），
 * 通过 onUnauthorized 注册表通知；本模块在应用启动（main.ts）时装配。
 */

import type { Router } from 'vue-router'

import { onUnauthorized } from '@/services/api'
import { useAuthStore } from '@/stores/auth'

/**
 * 装配 401 统一处理：清会话 + 跳登录（携带 redirect 回跳原目标路由）。
 * @returns 取消装配函数（测试用）
 */
export function installAuthBridge(router: Router): () => void {
  return onUnauthorized(() => {
    const auth = useAuthStore()
    auth.clearSession()
    const current = router.currentRoute.value
    if (current.path !== '/login') {
      void router.replace({ path: '/login', query: { redirect: current.fullPath } })
    }
  })
}
