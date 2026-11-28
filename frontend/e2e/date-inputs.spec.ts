import { expect, test, type Page } from '@playwright/test'

import { today } from './business-fixtures'

/**
 * 统一业务日期组件 E2E（真实浏览器 + 真实后端）：
 * 手动输入 / 日历选择（reka-ui Popover + Calendar）/ 清空 / 键盘操作 /
 * 必填校验 / 非法日期（闰年）校验 / min-max 限制 / 会计月份选择 / 日期范围校验。
 *
 * 说明：本文件原断言依赖演示夹具的固定基准日（2026-11-30）与固定行数，
 * Phase 2 起改为真实业务日期与真实 API 页面，仅保留组件行为与校验语义。
 */

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
}

test.describe('业务日期输入（登记回款 · 实际收款日期）', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/business/processing-fee')
    await page.getByTestId('open-registration').click()
    await expect(page.locator('#receipt-registration')).toBeVisible()
  })

  test('默认值为当前业务日期并展示格式回显（YYYY-MM-DD）', async ({ page }) => {
    const hint = page.locator('#receipt-date-format-hint')
    await expect(hint).toContainText('格式 YYYY-MM-DD')
    await expect(hint).toContainText(today())
  })

  test('非法日期（2026-02-30）UI 层报错并阻断确认', async ({ page }) => {
    await page.locator('#receipt-date').fill('2026-02-30')
    const error = page.locator('#receipt-date-input-error')
    await expect(error).toBeVisible()
    await expect(error).toContainText('日期不存在')
    await expect(error).toContainText('闰年')
    await expect(page.getByTestId('confirm-receipt')).toBeDisabled()
  })

  test('闰年校验：2025-02-29 报错、2024-02-29 通过', async ({ page }) => {
    await page.locator('#receipt-date').fill('2025-02-29')
    await page.locator('#receipt-date').blur()
    await expect(page.locator('#receipt-date-input-error')).toContainText('日期不存在')

    await page.locator('#receipt-date').fill('2024-02-29')
    await expect(page.locator('#receipt-date-input-error')).toHaveCount(0)
  })

  test('max 限制：实际收款日期不得晚于业务基准日（今天）', async ({ page }) => {
    const future = new Date(`${today()}T00:00:00Z`)
    future.setUTCDate(future.getUTCDate() + 7)
    const futureDate = future.toISOString().slice(0, 10)

    await page.locator('#receipt-date').fill(futureDate)
    await page.locator('#receipt-date').blur()
    await expect(page.locator('#receipt-date-input-error')).toContainText(`日期不得晚于 ${today()}`)
    await expect(page.getByTestId('confirm-receipt')).toBeDisabled()
  })

  test('清空（必填）提示与恢复', async ({ page }) => {
    await page.locator('#receipt-registration').getByRole('button', { name: '清空日期' }).click()
    await page.locator('#receipt-date').blur()
    await expect(page.locator('#receipt-date-input-error')).toContainText('请输入业务日期')

    await page.locator('#receipt-date').fill(today())
    await expect(page.locator('#receipt-date-input-error')).toHaveCount(0)
  })

  test('日历选择：打开浮层点选日期回填（键盘 ESC 可关闭）', async ({ page }) => {
    const trigger = page.locator('#receipt-registration').getByRole('button', { name: '打开日历' })
    await trigger.click()
    const popover = page.getByTestId('date-picker-popover')
    await expect(popover).toBeVisible()

    // 在当前显示月份中点击第 1 天（可访问名称形如「2026年11月1日」）
    const firstDay = popover.getByRole('button', { name: /(\d{4})年(\d{1,2})月1日/ }).first()
    await firstDay.click()
    const month = today().slice(0, 7)
    await expect(page.locator('#receipt-date')).toHaveValue(`${month}-01`)
    await expect(page.locator('#receipt-date-format-hint')).toContainText(`${month}-01`)

    // 键盘操作：聚焦触发按钮回车打开，ESC 关闭
    await trigger.focus()
    await page.keyboard.press('Enter')
    await expect(popover).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(popover).toBeHidden()
  })

  test('移动端浮层无横向溢出', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.locator('#receipt-registration').getByRole('button', { name: '打开日历' }).click()
    await expect(page.getByTestId('date-picker-popover')).toBeVisible()
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
  })
})

test.describe('会计月份与日期字段（新建应收单）', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/business/receivables')
    await page.getByTestId('create-receivable-open').click()
    await expect(page.getByRole('dialog')).toBeVisible()
  })

  test('非法月份（2026-13）提示；月份选择器点选回填', async ({ page }) => {
    await page.getByLabel('所属月份', { exact: true }).fill('2026-13')
    await page.getByLabel('所属月份', { exact: true }).blur()
    await expect(page.locator('#create-month-input-error')).toContainText('月份不存在')

    const trigger = page.getByRole('button', { name: '打开月份选择' })
    await trigger.click()
    const popover = page.getByTestId('month-picker-popover')
    await expect(popover).toBeVisible()
    await popover.getByRole('button', { name: '12月' }).click()
    await expect(page.getByLabel('所属月份', { exact: true })).toHaveValue(/^\d{4}-12$/)
  })

  test('非法日期（2026-02-30）对对账日期提示；到期日期留空 = 未约定到期日', async ({ page }) => {
    await page.getByLabel('对账日期').fill('2026-02-30')
    await expect(page.locator('#create-statement-date-input-error')).toContainText('日期不存在')

    await expect(page.getByText('留空表示未约定到期日（不据此判定逾期）')).toBeVisible()
    await page.getByLabel('到期日期').fill('')
    await expect(page.locator('#create-due-date-input-error')).toHaveCount(0)
  })
})

test.describe('日期范围校验（资金流水）', () => {
  test('范围顺序校验：开始日期不得晚于结束日期', async ({ page }) => {
    await page.goto('/treasury/transactions')
    await expect(page.getByTestId('transactions-table')).toBeVisible()

    await page.getByLabel('交易开始日期').fill('2026-11-10')
    await page.getByLabel('交易结束日期').fill('2026-11-01')
    await expect(page.locator('[id$="-range-error"]').first()).toContainText('开始日期不得晚于结束日期')

    await page.getByLabel('交易开始日期').fill('2026-11-01')
    await page.getByLabel('交易结束日期').fill('2026-11-10')
    await expect(page.getByTestId('transactions-table')).toBeVisible()
  })
})
