import { expect, test } from '@playwright/test'

test.describe('Application Shell', () => {
  test('页面正常加载并展示侧边栏与导航分组', async ({ page }) => {
    await page.goto('/workbench')

    await expect(page).toHaveTitle(/工厂财务/)
    await expect(page.locator('[data-testid="sidebar"]')).toBeVisible()
    await expect(page.locator('[data-testid="header"]')).toBeVisible()
    await expect(page.getByText('工厂财务').first()).toBeVisible()
    await expect(page.getByText('资金管理')).toBeVisible()
    await expect(page.getByText('业务管理')).toBeVisible()
    await expect(page.getByText('财务核算')).toBeVisible()
    await expect(page.getByText('基础资料')).toBeVisible()

    // 经营概览已接入原型页（Phase 0.2）
    await expect(page.getByRole('heading', { name: '经营概览' })).toBeVisible()
  })

  test('Sidebar 折叠与展开', async ({ page }) => {
    await page.goto('/workbench')
    const sidebar = page.locator('[data-testid="sidebar"]')

    await expect(sidebar).toHaveCSS('width', '224px')
    await page.locator('[data-testid="sidebar-toggle"]').click()
    await expect(sidebar).toHaveCSS('width', '56px')
    await page.locator('[data-testid="sidebar-toggle"]').click()
    await expect(sidebar).toHaveCSS('width', '224px')
  })

  test('导航行为：点击菜单跳转到对应页面', async ({ page }) => {
    await page.goto('/workbench')
    const sidebar = page.locator('[data-testid="sidebar"]')

    // 原型页面（Phase 0.2）
    await sidebar.getByRole('link', { name: /应收账款/ }).click()
    await expect(page).toHaveURL(/\/business\/receivables/)
    await expect(page.getByRole('heading', { name: '应收账款' })).toBeVisible()

    // 占位页面明确标记尚未实现
    await sidebar.getByRole('link', { name: /股东往来/ }).click()
    await expect(page).toHaveURL(/\/business\/shareholder/)
    await expect(page.getByRole('heading', { name: '股东往来' })).toBeVisible()
    await expect(page.getByText('该功能尚未实现')).toBeVisible()
    await expect(page.getByText('Phase 2')).toBeVisible()

    await sidebar.getByRole('link', { name: /资金账户/ }).click()
    await expect(page).toHaveURL(/\/treasury\/accounts/)
    await expect(page.getByRole('heading', { name: '资金账户' })).toBeVisible()
  })

  test('页面无非预期横向溢出', async ({ page }) => {
    await page.goto('/workbench')
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })
})
