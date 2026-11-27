import { mkdirSync, writeFileSync } from 'node:fs'

import type { FullConfig } from '@playwright/test'

/**
 * 全局登录：为除认证流程外的全部用例注入已登录 storageState。
 * 业务页均受登录守卫保护；未登录用例（phase1-auth）自行清空 storageState。
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use?.baseURL ?? 'http://127.0.0.1:4173'
  const username = process.env.PHASE1_E2E_USERNAME ?? 'admin'
  const password = process.env.PHASE1_E2E_PASSWORD ?? 'admin123'

  const response = await fetch(new URL('/api/v1/auth/login', baseURL), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!response.ok) {
    throw new Error(`全局登录失败：${response.status} ${await response.text()}`)
  }
  const payload = (await response.json()) as {
    data: { accessToken: string; tokenType: string; expiresAt: number; user: { username: string; displayName: string } }
  }
  const session = payload.data

  const state = {
    cookies: [] as unknown[],
    origins: [
      {
        origin: new URL(baseURL).origin,
        localStorage: [
          {
            name: 'factory-finance.auth',
            value: JSON.stringify({
              accessToken: session.accessToken,
              tokenType: session.tokenType,
              expiresAt: session.expiresAt,
              user: session.user,
            }),
          },
        ],
      },
    ],
  }
  mkdirSync('test-results/.auth', { recursive: true })
  writeFileSync('test-results/.auth/state.json', JSON.stringify(state))
}
