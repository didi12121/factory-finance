import { expect, test } from '@playwright/test'

test.describe('移动端布局（390×844）', () => {
  test('移动端侧边栏转换为抽屉', async ({ page }) => {
    await page.goto('/workbench')

    // 桌面侧边栏在移动端隐藏
    await expect(page.locator('[data-testid="sidebar"]')).toBeHidden()

    await page.locator('[data-testid="mobile-nav-open"]').click()
    const drawer = page.locator('[data-testid="mobile-nav"]')
    await expect(drawer).toBeVisible()
    await expect(drawer.getByText('资金管理')).toBeVisible()

    // 抽屉内导航跳转并自动关闭
    await drawer.getByRole('link', { name: /应付账款/ }).click()
    await expect(page).toHaveURL(/\/business\/payables/)
    await expect(drawer).toBeHidden()
    await expect(page.getByRole('heading', { name: '应付账款' })).toBeVisible()
  })

  test('移动端无非预期横向溢出', async ({ page }) => {
    for (const path of ['/workbench', '/dev/design-system']) {
      await page.goto(path)
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow, `${path} 出现横向溢出`).toBeLessThanOrEqual(0)
    }
  })
})
