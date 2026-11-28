import { expect, test } from '@playwright/test'

/**
 * 生产构建防护（真实生产构建产物 + 真实后端）：
 * Design System 展示页在生产构建下必须不可用（路由守卫重定向回工作台），
 * 且业务页面（经营概览）在登录后可用。
 */

const USERNAME = process.env.PHASE1_E2E_USERNAME ?? 'admin'
const PASSWORD = process.env.PHASE1_E2E_PASSWORD ?? 'admin123'

test.describe('生产构建防护', () => {
  test('/dev/design-system 在生产构建下不可使用', async ({ page }) => {
    // 业务页受登录守卫保护：先完成真实登录（生产构建 + 真实 API）
    await page.goto('/login')
    await page.getByLabel('用户名').fill(USERNAME)
    await page.getByLabel('密码').fill(PASSWORD)
    await page.getByRole('button', { name: '登录' }).click()
    await expect(page).toHaveURL(/\/workbench/)

    await expect(page.getByRole('heading', { name: '经营概览' })).toBeVisible()

    await page.goto('/dev/design-system')
    // 生产构建（无 VITE_ENABLE_DESIGN_SYSTEM）下路由守卫重定向回工作台
    await expect(page).toHaveURL(/\/workbench/)
    await expect(page.getByRole('heading', { name: '经营概览' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Color Tokens' })).toHaveCount(0)
  })
})
