import { expect, test } from '@playwright/test'

test.describe('Design System Showcase', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dev/design-system')
  })

  test('展示页完整渲染全部区块', async ({ page }) => {
    for (const heading of [
      'Color Tokens',
      'Typography',
      'Buttons',
      'Inputs / AmountInput',
      'Tabs',
      'DataTable',
      'Dialog / DetailSheet',
      'FinancialMetric / MoneyText',
      'FinancialStatus',
      'EmptyState / LoadingState / ErrorState',
    ]) {
      await expect(page.getByRole('heading', { name: heading })).toBeVisible()
    }
    await expect(page.getByText('开发 / 测试环境专用')).toBeVisible()
    await expect(page.getByText('虚构测试数据').first()).toBeVisible()
  })

  test('Dialog 打开和关闭', async ({ page }) => {
    await page.locator('[data-testid="dialog-open"]').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('确认删除测试单据？')).toBeVisible()

    await dialog.getByRole('button', { name: '关闭对话框' }).click()
    await expect(dialog).toBeHidden()
  })

  test('Dialog 支持键盘 Escape 关闭', async ({ page }) => {
    await page.locator('[data-testid="dialog-open"]').click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toBeHidden()
  })

  test('DetailSheet 打开和关闭', async ({ page }) => {
    await page.locator('[data-testid="sheet-open"]').click()
    const sheet = page.getByRole('dialog')
    await expect(sheet).toBeVisible()
    await expect(sheet.getByText('单据详情')).toBeVisible()
    await expect(sheet.getByText('XS-2026-0001')).toBeVisible()

    await sheet.getByRole('button', { name: '关闭详情面板' }).click()
    await expect(sheet).toBeHidden()
  })

  test('Toast 展示与关闭', async ({ page }) => {
    await page.getByRole('button', { name: '显示 Toast' }).click()
    const toast = page.getByRole('status').filter({ hasText: '保存成功' })
    await expect(toast).toBeVisible()

    await toast.getByRole('button', { name: '关闭通知' }).click()
    await expect(toast).toBeHidden()
  })

  test('金额组件显示规范格式', async ({ page }) => {
    await expect(page.getByText('1,850.39').first()).toBeVisible()
    await expect(page.getByText('-1,850.39').first()).toBeVisible()
    await expect(page.getByText('1,000,000.00').first()).toBeVisible()
    await expect(page.getByText('0.00').first()).toBeVisible()
  })

  test('页面无非预期横向溢出', async ({ page }) => {
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })
})
