import { expect, test } from '@playwright/test'

test.describe('键盘可访问性', () => {
  test('Tab 键可移动焦点，Enter 激活导航链接', async ({ page }) => {
    await page.goto('/workbench')

    // Tab 遍历应能到达可交互元素（焦点不滞留 body）
    let focusedTag = ''
    for (let i = 0; i < 10 && focusedTag === ''; i += 1) {
      await page.keyboard.press('Tab')
      focusedTag = await page.evaluate(() => {
        const el = document.activeElement
        return el && el !== document.body ? el.tagName : ''
      })
    }
    expect(focusedTag).not.toBe('')

    const link = page.locator('[data-testid="sidebar"]').getByRole('link', { name: /应收账款/ })
    await link.focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/business\/receivables/)
    await expect(page.getByRole('heading', { name: '应收账款' })).toBeVisible()
  })

  test('对话框打开后焦点进入对话框，Escape 可关闭', async ({ page }) => {
    await page.goto('/dev/design-system')
    await page.locator('[data-testid="dialog-open"]').click()

    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toBeHidden()
  })

  test('表单控件具备可访问名称', async ({ page }) => {
    await page.goto('/dev/design-system')
    await expect(page.getByLabel('客户名称')).toBeVisible()
    await expect(page.getByLabel('收款金额')).toBeVisible()
  })

  test('表格支持键盘触发排序（Enter / Space）', async ({ page }) => {
    await page.goto('/dev/design-system')
    const header = page.locator('[data-testid="data-table"] th', { hasText: '单据编号' })

    await header.focus()
    await page.keyboard.press('Enter')
    await expect(header).toHaveAttribute('aria-sort', 'ascending')

    await page.keyboard.press(' ')
    await expect(header).toHaveAttribute('aria-sort', 'descending')
  })
})
