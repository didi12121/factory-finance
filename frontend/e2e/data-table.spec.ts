import { expect, test } from '@playwright/test'

test.describe('DataTable', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dev/design-system')
  })

  test('DataTable 单据编号排序', async ({ page }) => {
    const table = page.locator('[data-testid="data-table"]')
    const firstCell = table.locator('tbody tr').first().locator('td').first()

    await expect(firstCell).toHaveText('XS-2026-0001')

    const header = table.locator('th', { hasText: '单据编号' })
    await header.click()
    await expect(header).toHaveAttribute('aria-sort', 'ascending')
    await expect(firstCell).toHaveText('XS-2026-0001')

    await header.click()
    await expect(header).toHaveAttribute('aria-sort', 'descending')
    await expect(firstCell).toHaveText('XS-2026-0023')
  })

  test('金额排序使用精确比较（负数与不同小数位）', async ({ page }) => {
    const table = page.locator('[data-testid="data-table"]')
    const amountCell = table.locator('tbody tr').first().locator('td').nth(3)
    const header = table.locator('th', { hasText: '金额' })

    // 升序：最小金额为负数样例 -100.00
    await header.click()
    await expect(header).toHaveAttribute('aria-sort', 'ascending')
    await expect(amountCell).toHaveText('-100.00')

    // 降序：最大金额 3,612.50（1234.5 与 1234.50 等值不因小数位产生误差）
    await header.click()
    await expect(header).toHaveAttribute('aria-sort', 'descending')
    await expect(amountCell).toHaveText('3,612.50')
  })

  test('DataTable 分页行为', async ({ page }) => {
    const table = page.locator('[data-testid="data-table"]')
    await expect(table.getByText('共 23 条')).toBeVisible()
    await expect(table.getByText('第 1 / 3 页')).toBeVisible()
    await expect(table.locator('tbody tr')).toHaveCount(10)

    await page.getByRole('button', { name: '下一页' }).click()
    await expect(table.getByText('第 2 / 3 页')).toBeVisible()
    await expect(table.locator('tbody tr').first().locator('td').first()).toHaveText('XS-2026-0011')

    await page.getByRole('button', { name: '上一页' }).click()
    await expect(table.getByText('第 1 / 3 页')).toBeVisible()
    await expect(page.getByRole('button', { name: '上一页' })).toBeDisabled()
  })

  test('空数据状态：真实断言行数、空提示与总记录数', async ({ page }) => {
    const table = page.locator('[data-testid="data-table"]')
    const search = page.getByPlaceholder('搜索单据编号或客户…')

    await search.fill('不存在的单据')

    // 无数据行：仅保留 1 行空态占位行（colspan 行），空提示与总数均为 0
    await expect(table.locator('tbody tr')).toHaveCount(1)
    await expect(table.locator('tbody tr td[colspan]')).toHaveCount(1)
    await expect(table.locator('tbody tr').getByText('暂无符合条件的单据')).toBeVisible()
    await expect(table.getByText('共 0 条')).toBeVisible()

    // 重置筛选后数据恢复
    await page.getByRole('button', { name: '重置筛选' }).click()
    await expect(table.locator('tbody tr')).toHaveCount(10)
    await expect(table.getByText('共 23 条')).toBeVisible()
    await expect(table.locator('tbody tr').first().locator('td').first()).toHaveText('XS-2026-0001')
  })

  test('筛选结果行数与总数一致', async ({ page }) => {
    const table = page.locator('[data-testid="data-table"]')
    const search = page.getByPlaceholder('搜索单据编号或客户…')

    // XS-2026-0003 精确命中 1 条
    await search.fill('XS-2026-0003')
    await expect(table.locator('tbody tr')).toHaveCount(1)
    await expect(table.locator('tbody tr').first().locator('td').first()).toHaveText('XS-2026-0003')
    await expect(table.getByText('共 1 条')).toBeVisible()
    await expect(table.getByText('第 1 / 1 页')).toBeVisible()
  })

  test('非第一页筛选导致数据减少时页码自动重置', async ({ page }) => {
    const table = page.locator('[data-testid="data-table"]')
    const search = page.getByPlaceholder('搜索单据编号或客户…')

    await page.getByRole('button', { name: '下一页' }).click()
    await expect(table.getByText('第 2 / 3 页')).toBeVisible()

    // 筛选命中 1 条（原第 1 页范围），当前页超出范围必须回退到第 1 页
    await search.fill('XS-2026-0003')
    await expect(table.getByText('第 1 / 1 页')).toBeVisible()
    await expect(table.locator('tbody tr')).toHaveCount(1)
    await expect(table.locator('tbody tr').first().locator('td').first()).toHaveText('XS-2026-0003')
  })

  test('列表操作与详情/确认弹窗数据一致（单一数据源）', async ({ page }) => {
    const table = page.locator('[data-testid="data-table"]')
    const row = table.locator('tbody tr').first()

    await row.getByRole('button', { name: '详情' }).click()
    const sheet = page.getByRole('dialog')
    await expect(sheet).toBeVisible()
    await expect(sheet.locator('dd').first()).toHaveText('XS-2026-0001')
    await expect(sheet.getByText('示例客户 A')).toBeVisible()
    await sheet.getByRole('button', { name: '关闭详情面板' }).click()

    await row.getByRole('button', { name: '删除' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('XS-2026-0001')).toBeVisible()
    await expect(dialog.getByText(/示例客户 A/)).toBeVisible()
    await dialog.getByRole('button', { name: '取消' }).click()
    await expect(dialog).toBeHidden()
  })
})
