import { expect, test } from '@playwright/test'

test.describe('生产构建防护', () => {
  test('/dev/design-system 在生产构建下不可使用', async ({ page }) => {
    await page.goto('/workbench')
    await expect(page.getByRole('heading', { name: '经营概览' })).toBeVisible()

    await page.goto('/dev/design-system')
    // 生产构建（无 VITE_ENABLE_DESIGN_SYSTEM）下路由守卫重定向回工作台
    await expect(page).toHaveURL(/\/workbench/)
    await expect(page.getByRole('heading', { name: '经营概览' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Color Tokens' })).toHaveCount(0)
  })
})
