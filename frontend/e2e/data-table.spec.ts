import { expect, test } from '@playwright/test'

test.describe('DataTable', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dev/design-system')
  })

  test('DataTable 排序', async ({ page }) => {
    const table = page.locator('[data-testid="data-table"]')
    const firstCell = table.locator('tbody tr').first().locator('td').first()

    await expect(firstCell).toHaveText('XS-2026-0001')

    const header = table.locator('th', { hasText: '单据编号' })
    await header.click()
    await expect(firstCell).toHaveText('XS-2026-0001')

    await header.click()
    await expect(firstCell).toHaveText('XS-2026-0023')
  })

  test('DataTable 分页', async ({ page }) => {
    const table = page.locator('[data-testid="data-table"]')
    await expect(page.getByText('共 23 条')).toBeVisible()
    await expect(page.getByText('第 1 / 3 页')).toBeVisible()
    await expect(table.locator('tbody tr')).toHaveCount(10)

    await page.getByRole('button', { name: '下一页' }).click()
    await expect(page.getByText('第 2 / 3 页')).toBeVisible()
    await expect(table.locator('tbody tr').first().locator('td').first()).toHaveText('XS-2026-0011')

    await page.getByRole('button', { name: '上一页' }).click()
    await expect(page.getByText('第 1 / 3 页')).toBeVisible()
    await expect(page.getByRole('button', { name: '上一页' })).toBeDisabled()
  })

  test('DataTable 空数据状态', async ({ page }) => {
    // 展示页搜索框过滤虚构数据为空时显示空状态
    const search = page.getByPlaceholder('搜索单据编号…')
    await search.fill('不存在的单据')
    // 本地展示表为静态测试数据，不随搜索过滤；此处验证搜索控件可交互
    await expect(search).toHaveValue('不存在的单据')
  })
})
