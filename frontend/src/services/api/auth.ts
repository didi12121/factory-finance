/**
 * 认证 API（docs/API_CONTRACT.md 第 10 节）。
 * POST /auth/login（公开）、POST /auth/logout、PUT /auth/password。
 */

import { post, put } from './client'
import type { ChangePasswordInput, LoginInput, LoginResult } from './types'

/** 登录：{username,password} → {accessToken,tokenType,expiresAt,user} */
export function login(input: LoginInput): Promise<LoginResult> {
  return post<LoginResult>('/auth/login', input)
}

/** 登出（服务端记录/预留；本地会话清理由 auth store 负责） */
export function logout(): Promise<void> {
  return post<void>('/auth/logout')
}

/** 修改密码 */
export function changePassword(input: ChangePasswordInput): Promise<void> {
  return put<void>('/auth/password', input)
}
