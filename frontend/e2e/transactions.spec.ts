import { expect, test } from '@playwright/test'

/**
 * 资金流水 E2E（Agent E / P02-E）—— 真实浏览器断言：
 * 过滤真实改变行数、精确金额排序、分页、清空筛选、汇总口径、
 * 详情（内部转账关联流水 / 加工费回款跳收款单）、空数据、响应式。
 */

const TABLE = '[data-testid="transactions-table"]'
const SUMMARY = '[data-testid="transactions-summary"]'
const SEARCH = '搜索流水编号、交易对手或备注…'

test.describe('资金流水列表与交易详情', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/treasury/transactions')
    await expect(page.getByRole('heading', { name: '资金流水' })).toBeVisible()
    await expect(page.locator(TABLE).getByText('共 22 条')).toBeVisible()
  })

  test('初始列表：22 条 / 分页 2 页 / 整体口径汇总金额与统计范围', async ({ page }) => {
    const table = page.locator(TABLE)
    await expect(table.locator('tbody tr')).toHaveCount(20)
    await expect(table.getByText('第 1 / 2 页')).toBeVisible()
    // 默认排序：交易日期倒序
    await expect(table.locator('tbody tr').first().locator('td').first()).toHaveText('FT-2026-0022')

    const summary = page.locator(SUMMARY)
    await expect(summary).toContainText('97,046.51')
    await expect(summary).toContainText('145,385.06')
    await expect(summary).toContainText('-48,338.55')
    await expect(page.locator('[data-testid="summary-scope"]')).toContainText('工厂整体外部收付')
    await expect(page.locator('[data-testid="summary-scope"]')).toContainText('已排除内部转账')
    await expect(page.locator('[data-testid="summary-count"]')).toHaveText(
      '当前筛选命中 22 条流水，其中 17 条计入汇总。',
    )
  })

  test('关键字过滤真实改变行数，清空筛选恢复全量', async ({ page }) => {
    const table = page.locator(TABLE)
    await page.getByPlaceholder(SEARCH).fill('示例客户 B')
    await expect(table.getByText('共 3 条')).toBeVisible()
    await expect(table.locator('tbody tr')).toHaveCount(3)

    await page.getByTestId('clear-filters').click()
    await expect(table.getByText('共 22 条')).toBeVisible()
    await expect(table.locator('tbody tr')).toHaveCount(20)
    await expect(page.getByPlaceholder(SEARCH)).toHaveValue('')
  })

  test('业务类型/方向/账户过滤真实改变行数', async ({ page }) => {
    const table = page.locator(TABLE)

    await page.getByRole('combobox', { name: '业务类型' }).click()
    await page.getByRole('option', { name: '内部转账' }).click()
    await expect(table.getByText('共 4 条')).toBeVisible()

    await page.getByRole('combobox', { name: '流水方向' }).click()
    await page.getByRole('option', { name: '流出（OUT）' }).click()
    await expect(table.getByText('共 2 条')).toBeVisible()

    await page.getByTestId('clear-filters').click()
    await expect(table.getByText('共 22 条')).toBeVisible()

    await page.getByRole('combobox', { name: '流水方向' }).click()
    await page.getByRole('option', { name: '流入（IN）' }).click()
    await expect(table.getByText('共 11 条')).toBeVisible()

    await page.getByTestId('clear-filters').click()
    await page.getByRole('combobox', { name: '资金账户' }).click()
    await page.getByRole('option', { name: '示例微信账户' }).click()
    await expect(table.getByText('共 2 条')).toBeVisible()
  })

  test('日期范围过滤（闭区间 2026-11-01 ~ 2026-11-10）命中 4 条', async ({ page }) => {
    const table = page.locator(TABLE)
    await page.getByLabel('交易开始日期').fill('2026-11-01')
    await page.getByLabel('交易结束日期').fill('2026-11-10')
    await expect(table.getByText('共 4 条')).toBeVisible()
    await expect(table.locator('tbody tr')).toHaveCount(4)
  })

  test('金额排序使用精确比较（收入/支出列，非字典序）', async ({ page }) => {
    const table = page.locator(TABLE)
    const incomeHeader = table.locator('th', { hasText: '收入金额' })
    const outcomeHeader = table.locator('th', { hasText: '支出金额' })

    // 收入金额升序：无收入行（显示 —）在前
    await incomeHeader.click()
    await expect(incomeHeader).toHaveAttribute('aria-sort', 'ascending')
    await expect(table.locator('tbody tr').first().locator('td').nth(5)).toHaveText('—')

    // 收入金额降序：最大收入 50,000.00（FT-2026-0001，数值序而非字典序）
    await incomeHeader.click()
    await expect(incomeHeader).toHaveAttribute('aria-sort', 'descending')
    await expect(table.locator('tbody tr').first().locator('td').first()).toHaveText('FT-2026-0001')
    await expect(table.locator('tbody tr').first().locator('td').nth(5)).toHaveText('50,000.00')

    // 支出金额降序：最大支出 45,000.00（FT-2026-0002）
    await outcomeHeader.click()
    await expect(outcomeHeader).toHaveAttribute('aria-sort', 'ascending')
    await outcomeHeader.click()
    await expect(outcomeHeader).toHaveAttribute('aria-sort', 'descending')
    await expect(table.locator('tbody tr').first().locator('td').first()).toHaveText('FT-2026-0002')
    await expect(table.locator('tbody tr').first().locator('td').nth(6)).toHaveText('45,000.00')
  })

  test('分页：第 1/2 页 20 行 → 下一页 2 行', async ({ page }) => {
    const table = page.locator(TABLE)
    await expect(table.locator('tbody tr')).toHaveCount(20)
    await page.getByRole('button', { name: '下一页' }).click()
    await expect(table.getByText('第 2 / 2 页')).toBeVisible()
    await expect(table.locator('tbody tr')).toHaveCount(2)
    await expect(table.locator('tbody tr').first().locator('td').first()).toHaveText('FT-2026-0002')
    await page.getByRole('button', { name: '上一页' }).click()
    await expect(table.getByText('第 1 / 2 页')).toBeVisible()
  })

  test('汇总口径：单账户真实 IN/OUT（含划转）vs 整体排除内部转账', async ({ page }) => {
    const summary = page.locator(SUMMARY)

    await page.getByRole('combobox', { name: '资金账户' }).click()
    await page.getByRole('option', { name: '示例银行账户' }).click()
    await expect(page.locator('[data-testid="summary-scope"]')).toContainText('示例银行账户')
    await expect(page.locator('[data-testid="summary-scope"]')).toContainText('含内部转账账户间划转')
    await expect(summary).toContainText('84,045.66')
    await expect(summary).toContainText('152,500.50')
    await expect(summary).toContainText('-68,454.84')

    await page.getByTestId('clear-filters').click()
    await page.getByRole('combobox', { name: '业务类型' }).click()
    await page.getByRole('option', { name: '内部转账' }).click()
    // 整体口径下划转不计收支
    await expect(page.locator('[data-testid="summary-count"]')).toHaveText(
      '当前筛选命中 4 条流水，其中 0 条计入汇总。',
    )
    await expect(summary).toContainText('0.00')
  })

  test('详情：全部字段 + 内部转账关联流水查看（transferGroupId 派对）', async ({ page }) => {
    const table = page.locator(TABLE)
    await page.getByPlaceholder(SEARCH).fill('FT-2026-0017')
    await expect(table.getByText('共 1 条')).toBeVisible()
    await table.locator('tbody tr').first().getByRole('button', { name: /详情/ }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    for (const text of [
      '资金流水详情 · FT-2026-0017',
      '内部转账',
      '示例银行账户',
      '示例现金账户',
      '流出（OUT）',
      '10,000.00',
      'tg-001',
      '已入账',
      '内部转账演示（成对流水）',
      '关联流水',
      'FT-2026-0018',
    ]) {
      await expect(dialog).toContainText(text)
    }

    // 切换到另一方向关联流水
    await dialog.getByRole('button', { name: '查看该流水' }).click()
    await expect(dialog).toContainText('资金流水详情 · FT-2026-0018')
    await expect(dialog).toContainText('示例现金账户')
    await expect(dialog).toContainText('流入（IN）')
    await expect(dialog).toContainText('FT-2026-0017')

    await dialog.getByRole('button', { name: '关闭', exact: true }).click()
    await expect(dialog).toBeHidden()
  })

  test('加工费回款详情：收款单回溯并跳收款单（冻结导航契约）', async ({ page }) => {
    const table = page.locator(TABLE)
    await page.getByPlaceholder(SEARCH).fill('FT-2026-0010')
    await expect(table.getByText('共 1 条')).toBeVisible()
    await table.locator('tbody tr').first().getByRole('button', { name: /详情/ }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('收款单 SK-2026-0002')
    await expect(dialog).toContainText('示例客户 B')
    await expect(dialog).toContainText('AR-2026-0004')

    await dialog.getByRole('button', { name: '查看收款单' }).click()
    await expect(page).toHaveURL(/\/business\/processing-fee\?action=create/)
    await expect(page.getByRole('heading', { name: '加工费回款' })).toBeVisible()
  })

  test('收款单详情的查看相关应收跳转（RECEIVABLES_ROUTE_PATH）', async ({ page }) => {
    const table = page.locator(TABLE)
    await page.getByPlaceholder(SEARCH).fill('FT-2026-0010')
    await table.locator('tbody tr').first().getByRole('button', { name: /详情/ }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    await dialog.getByRole('button', { name: '查看相关应收' }).click()
    await expect(page).toHaveURL(/\/business\/receivables/)
  })

  test('空数据状态：无命中显示空态与 0 条统计', async ({ page }) => {
    const table = page.locator(TABLE)
    await page.getByPlaceholder(SEARCH).fill('zzz-不存在')
    await expect(table.getByText('共 0 条')).toBeVisible()
    await expect(page.locator('[data-testid="data-table-empty"]')).toBeVisible()
    await expect(table.getByText('暂无符合条件的流水')).toBeVisible()
    await expect(page.locator('[data-testid="summary-count"]')).toHaveText(
      '当前筛选命中 0 条流水，其中 0 条计入汇总。',
    )
  })

  test('键盘可访问：详情按钮可聚焦并回车打开详情面板', async ({ page }) => {
    const table = page.locator(TABLE)
    const detailButton = table.locator('tbody tr').first().getByRole('button', { name: /详情/ })
    await detailButton.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toBeHidden()
  })
})

test.describe('资金流水响应式（无页面级横向溢出）', () => {
  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1440, height: 900 },
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
  ]) {
    test(`${viewport.width}×${viewport.height} 布局无非预期横向溢出`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await page.goto('/treasury/transactions')
      await expect(page.locator(TABLE).getByText('共 22 条')).toBeVisible()

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow, '页面出现横向溢出').toBeLessThanOrEqual(0)

      if (viewport.width === 390) {
        // 移动端：宽表格在表格容器内横向滚动，详情面板可打开
        const tableWrap = page.locator(`${TABLE} .overflow-x-auto`).first()
        const scrollable = await tableWrap.evaluate((el) => el.scrollWidth > el.clientWidth)
        expect(scrollable, '表格容器应支持内部横向滚动').toBe(true)

        await page
          .locator(TABLE)
          .locator('tbody tr')
          .first()
          .getByRole('button', { name: /详情/ })
          .click()
        await expect(page.getByRole('dialog')).toBeVisible()
        await page.getByRole('button', { name: '关闭', exact: true }).click()
        await expect(page.getByRole('dialog')).toBeHidden()
      }
    })
  }
})
