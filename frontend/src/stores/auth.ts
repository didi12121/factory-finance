/**
 * 认证状态（Pinia）：登录 / 登出 / 修改密码 + 会话持久。
 *
 * 约定：
 * - 令牌**内存 + localStorage 持久**（键 `factory-finance.auth`），刷新页面恢复会话；
 * - 登录成功同步 `services/api` 的 Bearer 令牌（apiClient 请求注入 `Authorization`）；
 * - 401 统一处理由 `app/authBridge.ts` 装配（登出 + 跳登录），本 store 只提供 clearSession；
 * - 令牌过期（expiresAt，Epoch 秒）视为未登录；后端校验为最终防线。
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { authApi, setAuthToken, type AuthUser } from '@/services/api'

/** localStorage 持久键 */
export const AUTH_STORAGE_KEY = 'factory-finance.auth'

/** 持久化的会话载荷 */
export interface PersistedSession {
  accessToken: string
  tokenType: string
  /** 过期时间（Epoch 秒） */
  expiresAt: number
  user: AuthUser
}

function readPersistedSession(): PersistedSession | null {
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY)
    if (raw === null) {
      return null
    }
    const parsed: unknown = JSON.parse(raw)
    if (
      parsed === null ||
      typeof parsed !== 'object' ||
      typeof (parsed as PersistedSession).accessToken !== 'string' ||
      typeof (parsed as PersistedSession).expiresAt !== 'number'
    ) {
      return null
    }
    return parsed as PersistedSession
  } catch {
    return null
  }
}

function persistSession(session: PersistedSession | null): void {
  try {
    if (session === null) {
      window.localStorage.removeItem(AUTH_STORAGE_KEY)
    } else {
      window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session))
    }
  } catch {
    /* 存储不可用时仅保留内存会话 */
  }
}

/** 会话是否过期（expiresAt 为 Epoch 秒） */
function isExpired(session: PersistedSession, nowMs: number): boolean {
  return session.expiresAt * 1000 <= nowMs
}

export const useAuthStore = defineStore('auth', () => {
  /** 令牌（内存态；localStorage 持久副本由本 store 管理） */
  const token = ref<string | null>(null)
  const tokenType = ref('Bearer')
  const expiresAt = ref<number | null>(null)
  const user = ref<AuthUser | null>(null)

  /** 当前会话有效：有令牌且未过期 */
  const isAuthenticated = computed(
    () => token.value !== null && expiresAt.value !== null && expiresAt.value * 1000 > Date.now(),
  )

  const displayName = computed(() => user.value?.displayName ?? user.value?.username ?? '')

  function applySession(session: PersistedSession): void {
    token.value = session.accessToken
    tokenType.value = session.tokenType
    expiresAt.value = session.expiresAt
    user.value = session.user
    setAuthToken(session.accessToken)
  }

  /** 初始化：从 localStorage 恢复会话（过期会话直接清理） */
  function restoreSession(): void {
    const session = readPersistedSession()
    if (session === null) {
      clearSession()
      return
    }
    if (isExpired(session, Date.now())) {
      clearSession()
      return
    }
    applySession(session)
  }

  /** 清除会话（登出 / 401 统一处理） */
  function clearSession(): void {
    token.value = null
    tokenType.value = 'Bearer'
    expiresAt.value = null
    user.value = null
    setAuthToken(null)
    persistSession(null)
  }

  /** 登录：保存会话并持久化 */
  async function login(username: string, password: string): Promise<AuthUser> {
    const result = await authApi.login({ username, password })
    applySession({
      accessToken: result.accessToken,
      tokenType: result.tokenType,
      expiresAt: result.expiresAt,
      user: result.user,
    })
    persistSession({
      accessToken: result.accessToken,
      tokenType: result.tokenType,
      expiresAt: result.expiresAt,
      user: result.user,
    })
    return result.user
  }

  /** 登出：尽力通知服务端（失败不阻断本地清理），随后清除本地会话 */
  async function logout(): Promise<void> {
    try {
      await authApi.logout()
    } catch {
      /* 服务端记录失败不阻断本地登出 */
    }
    clearSession()
  }

  /** 修改密码（成功后仍需用户用新密码重新登录的策略由后端决定） */
  async function changePassword(oldPassword: string, newPassword: string): Promise<void> {
    await authApi.changePassword({ oldPassword, newPassword })
  }

  return {
    token,
    tokenType,
    expiresAt,
    user,
    isAuthenticated,
    displayName,
    restoreSession,
    clearSession,
    login,
    logout,
    changePassword,
  }
})
