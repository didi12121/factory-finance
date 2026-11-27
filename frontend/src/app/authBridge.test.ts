import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'

import { installAuthBridge } from './authBridge'
import { clearUnauthorizedHandlers, getAuthToken, setAuthToken, treasuryApi } from '@/services/api'
import { fail, installMockAdapter } from '@/services/api/testAdapter'
import { AUTH_STORAGE_KEY, useAuthStore } from '@/stores/auth'

const FUTURE = Math.floor(Date.now() / 1000) + 3600

function seedSession(): void {
  window.localStorage.setItem(
    AUTH_STORAGE_KEY,
    JSON.stringify({
      accessToken: 'jwt-401',
      tokenType: 'Bearer',
      expiresAt: FUTURE,
      user: { id: 'u-1', username: 'admin', displayName: null },
    }),
  )
  useAuthStore().restoreSession()
}

function createTestRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/login', component: { template: '<div>login</div>' } },
      { path: '/workbench', component: { template: '<div>workbench</div>' } },
      { path: '/treasury/transactions', component: { template: '<div>fundflow</div>' } },
    ],
  })
}

describe('401 统一登出跳登录（authBridge）', () => {
  let restore: () => void
  let uninstall: () => void

  beforeEach(() => {
    setActivePinia(createPinia())
    window.localStorage.clear()
    setAuthToken(null)
    clearUnauthorizedHandlers()
  })

  afterEach(() => {
    uninstall?.()
    restore?.()
    clearUnauthorizedHandlers()
    setAuthToken(null)
    window.localStorage.clear()
  })

  it('业务请求 401：清会话 + 跳登录并携带回跳目标', async () => {
    seedSession()
    const router = createTestRouter()
    uninstall = installAuthBridge(router)
    await router.push('/treasury/transactions')

    const mock = installMockAdapter(() => fail(401, 'UNAUTHORIZED', '未认证或凭证无效'))
    restore = mock.restore

    await expect(treasuryApi.listFundTransactions({ page: 1, size: 20 })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
    await flushPromises()

    // 会话已清（内存 + 持久 + Bearer）
    const auth = useAuthStore()
    expect(auth.isAuthenticated).toBe(false)
    expect(getAuthToken()).toBeNull()
    expect(window.localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull()

    // 跳登录并回跳原目标路由
    expect(router.currentRoute.value.path).toBe('/login')
    expect(router.currentRoute.value.query.redirect).toBe('/treasury/transactions')
  })

  it('已在登录页时不重复跳转', async () => {
    const router = createTestRouter()
    uninstall = installAuthBridge(router)
    await router.push('/login')

    const mock = installMockAdapter(() => fail(401, 'UNAUTHORIZED', '未认证或凭证无效'))
    restore = mock.restore

    await expect(treasuryApi.listFundTransactions({ page: 1, size: 20 })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/login')
    expect(router.currentRoute.value.query.redirect).toBeUndefined()
  })
})
