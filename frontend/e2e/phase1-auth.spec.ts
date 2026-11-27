/**
 * Phase 1 E2E —— 登录/登出/路由守卫（真实认证 API）。
 * 供集成阶段全栈运行（前置条件见 phase1-helpers.ts）。
 */

import { expect, test } from '@playwright/test'

import { E2E_PASSWORD, E2E_USERNAME, login } from './phase1-helpers'

// 认证流程需未登录态（全局 storageState 在此清空）
test.use({ storageState: { cookies: [], origins: [] } })

test.describe('Phase 1 认证（真实 API）', () => {
  test('未登录访问业务页 → 登录页并携带回跳目标', async ({ page }) => {
    await page.goto('/treasury/accounts')
    await expect(page).toHaveURL(/\/login\?redirect=(%2F|\/)treasury(%2F|\/)accounts/)
    await expect(page.getByTestId('login-panel')).toBeVisible()
  })

  test('凭证错误展示可读错误提示', async ({ page }) => {
    await page.goto('/login')
    await page.getByTestId('login-username').fill(E2E_USERNAME)
    await page.getByTestId('login-password').fill('wrong-password')
    await page.getByTestId('login-submit').click()

    await expect(page.getByTestId('login-error')).toBeVisible()
    await expect(page.getByTestId('login-error')).not.toBeEmpty()
    await expect(page).toHaveURL(/\/login/)
  })

  test('登录成功回跳原目标路由', async ({ page }) => {
    await page.goto('/login?redirect=%2Ftreasury%2Faccounts')
    await page.getByTestId('login-username').fill(E2E_USERNAME)
    await page.getByTestId('login-password').fill(E2E_PASSWORD)
    await page.getByTestId('login-submit').click()

    await expect(page).toHaveURL(/\/treasury\/accounts/)
    // 头部显示当前登录用户（displayName 回退 username，此处断言非空）
    await expect(page.getByTestId('user-name')).not.toBeEmpty()
  })

  test('退出登录后业务页不可访问', async ({ page }) => {
    await login(page)
    await page.goto('/workbench')
    await page.getByTestId('logout-button').click()
    await expect(page).toHaveURL(/\/login/)

    await page.goto('/treasury/transactions')
    await expect(page).toHaveURL(/\/login\?redirect=(%2F|\/)treasury(%2F|\/)transactions/)
  })
})
