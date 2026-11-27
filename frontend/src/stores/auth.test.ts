import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { AUTH_STORAGE_KEY, useAuthStore } from './auth'
import { getAuthToken, setAuthToken } from '@/services/api'
import { fail, installMockAdapter, ok } from '@/services/api/testAdapter'

const FUTURE = Math.floor(Date.now() / 1000) + 3600
const PAST = Math.floor(Date.now() / 1000) - 10

const loginPayload = {
  accessToken: 'jwt-token-1',
  tokenType: 'Bearer',
  expiresAt: FUTURE,
  user: { id: 'u-1', username: 'admin', displayName: '管理员' },
}

describe('认证状态 stores/auth', () => {
  let restore: () => void

  beforeEach(() => {
    setActivePinia(createPinia())
    window.localStorage.clear()
    setAuthToken(null)
  })

  afterEach(() => {
    restore?.()
    window.localStorage.clear()
    setAuthToken(null)
  })

  it('登录成功：内存会话 + localStorage 持久 + Bearer 令牌注入', async () => {
    const mock = installMockAdapter(() => ok(loginPayload))
    restore = mock.restore
    const auth = useAuthStore()

    const user = await auth.login('admin', 'secret')

    expect(user.username).toBe('admin')
    expect(auth.isAuthenticated).toBe(true)
    expect(auth.token).toBe('jwt-token-1')
    expect(getAuthToken()).toBe('jwt-token-1')
    expect(auth.displayName).toBe('管理员')

    // localStorage 持久（刷新可恢复）
    const persisted = JSON.parse(window.localStorage.getItem(AUTH_STORAGE_KEY) ?? 'null')
    expect(persisted).toMatchObject({ accessToken: 'jwt-token-1', expiresAt: FUTURE })

    // 请求体与路径（登录契约）
    expect(mock.requests[0]?.url).toBe('/auth/login')
    expect(mock.requests[0]?.body).toEqual({ username: 'admin', password: 'secret' })
  })

  it('登录失败（401）：不产生会话，错误上抛', async () => {
    const mock = installMockAdapter(() => fail(401, 'UNAUTHORIZED', '用户名或密码错误'))
    restore = mock.restore
    const auth = useAuthStore()

    await expect(auth.login('admin', 'wrong')).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    expect(auth.isAuthenticated).toBe(false)
    expect(window.localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull()
    expect(getAuthToken()).toBeNull()
  })

  it('恢复会话：有效持久会话恢复为已登录', () => {
    window.localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({
        accessToken: 'jwt-token-2',
        tokenType: 'Bearer',
        expiresAt: FUTURE,
        user: { id: 'u-2', username: 'ops', displayName: null },
      }),
    )
    const auth = useAuthStore()
    auth.restoreSession()
    expect(auth.isAuthenticated).toBe(true)
    expect(auth.displayName).toBe('ops')
    expect(getAuthToken()).toBe('jwt-token-2')
  })

  it('恢复会话：过期会话直接清理（视为未登录）', () => {
    window.localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({
        accessToken: 'jwt-expired',
        tokenType: 'Bearer',
        expiresAt: PAST,
        user: { id: 'u-3', username: 'old', displayName: null },
      }),
    )
    const auth = useAuthStore()
    auth.restoreSession()
    expect(auth.isAuthenticated).toBe(false)
    expect(window.localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull()
    expect(getAuthToken()).toBeNull()
  })

  it('登出：清理本地会话（服务端登出失败不阻断）', async () => {
    const mock = installMockAdapter(() => fail(500, 'INTERNAL_ERROR', '服务器内部错误'))
    restore = mock.restore
    const auth = useAuthStore()
    window.localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({
        accessToken: 'jwt-token-3',
        tokenType: 'Bearer',
        expiresAt: FUTURE,
        user: { id: 'u-1', username: 'admin', displayName: null },
      }),
    )
    auth.restoreSession()
    expect(auth.isAuthenticated).toBe(true)

    await auth.logout()

    expect(auth.isAuthenticated).toBe(false)
    expect(auth.token).toBeNull()
    expect(getAuthToken()).toBeNull()
    expect(window.localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull()
  })

  it('clearSession（401 统一处理）清空全部会话状态', () => {
    window.localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({
        accessToken: 'jwt-token-4',
        tokenType: 'Bearer',
        expiresAt: FUTURE,
        user: { id: 'u-1', username: 'admin', displayName: null },
      }),
    )
    const auth = useAuthStore()
    auth.restoreSession()
    auth.clearSession()
    expect(auth.isAuthenticated).toBe(false)
    expect(getAuthToken()).toBeNull()
    expect(window.localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull()
  })

  it('修改密码调用 PUT /auth/password', async () => {
    const mock = installMockAdapter(() => ok(null))
    restore = mock.restore
    const auth = useAuthStore()
    await auth.changePassword('old-pw', 'new-pw')
    expect(mock.requests[0]?.method).toBe('PUT')
    expect(mock.requests[0]?.url).toBe('/auth/password')
    expect(mock.requests[0]?.body).toEqual({ oldPassword: 'old-pw', newPassword: 'new-pw' })
  })
})
