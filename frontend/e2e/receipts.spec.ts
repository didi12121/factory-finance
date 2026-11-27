import { expect, test, type Page } from '@playwright/test'

/**
 * 加工费回款 E2E（真实浏览器）：
 * 收款单列表 / 选择客户加载应收 / 跨页路由预填 / 完整登记 + 核销 + 确认流程 /
 * 错误态（超额、未分配、非法金额）/ 成功后列表更新与防重复提交 / 移动端 390×844。
 */

const PAGE_URL = '/business/processing-fee'

/** 打开登记回款表单 */
async function openRegistration(page: Page): Promise<void> {
  await page.goto(PAGE_URL)
  await page.getByTestId('open-registration').click()
  await expect(page.locator('#receipt-registration')).toBeVisible()
}

/** 通过共享 Select 选择客户（真实交互） */
async function chooseCustomer(page: Page, customerName: string): Promise<void> {
  await page.getByTestId('registration-customer').click()
  await page.getByRole('option', { name: customerName }).click()
  await expect(page.getByTestId('registration-customer')).toContainText(customerName)
}

test.describe('加工费回款 — 收款单列表', () => {
  test('列表展示、筛选、精确金额排序与详情', async ({ page }) => {
    await page.goto(PAGE_URL)

    const table = page.getByTestId('receipt-list-table')
    await expect(table.getByText('共 8 条')).toBeVisible()
    // 默认排序：到账日期倒序，首行为 SK-2026-0007（2026-11-22）
    await expect(table.locator('tbody tr').first()).toContainText('SK-2026-0007')
    // 派生列：已核销 12,345.66 / 未分配 0.00 / 状态 已全额核销
    await expect(table.locator('tbody tr').first()).toContainText('12,345.66')
    await expect(table.locator('tbody tr').first()).toContainText('已全额核销')

    // 精确金额排序（compareAmounts）：升序首行最小 1,600.00，降序首行最大 12,345.66
    await table.locator('th', { hasText: '实际收款金额' }).click()
    await expect(table.locator('tbody tr').first()).toContainText('SK-2026-0008')
    await expect(table.locator('tbody tr').first()).toContainText('1,600.00')
    await table.locator('th', { hasText: '实际收款金额' }).click()
    await expect(table.locator('tbody tr').first()).toContainText('SK-2026-0007')
    await expect(table.locator('tbody tr').first()).toContainText('12,345.66')

    // 筛选：客户 / 搜索 / 日期
    await page.getByTestId('filter-customer').click()
    await page.getByRole('option', { name: '示例客户 C' }).click()
    await expect(table.getByText('共 1 条')).toBeVisible()
    await expect(table.locator('tbody tr')).toHaveCount(1)
    await expect(table.locator('tbody tr').first()).toContainText('SK-2026-0006')

    await page.getByTestId('reset-filters').click()
    await expect(table.getByText('共 8 条')).toBeVisible()

    await page.getByTestId('receipt-search').locator('input').fill('BANK-REF-0001')
    await expect(table.getByText('共 1 条')).toBeVisible()
    await expect(table.locator('tbody tr').first()).toContainText('SK-2026-0001')
    await page.getByTestId('reset-filters').click()

    // 详情（DetailSheet）：收款单 + 核销明细
    await table.locator('tbody tr', { hasText: 'SK-2026-0003' }).getByRole('button', { name: '详情' }).click()
    const sheet = page.getByRole('dialog')
    await expect(sheet).toBeVisible()
    await expect(sheet).toContainText('SK-2026-0003')
    await expect(sheet).toContainText('5,000.00')
    await expect(sheet).toContainText('AR-2026-0004')
    await expect(sheet).toContainText('AR-2026-0008')
    await sheet.getByRole('button', { name: '关闭详情面板' }).click()
    await expect(sheet).toBeHidden()
  })
})

test.describe('加工费回款 — 登记与核销交互', () => {
  test('选择客户后加载未结清应收单（表内金额真实断言）', async ({ page }) => {
    await openRegistration(page)
    await chooseCustomer(page, '示例客户 A')

    const row1 = page.getByTestId('allocation-row-ar-001')
    await expect(row1).toBeVisible()
    await expect(row1).toContainText('AR-2026-0001')
    await expect(row1).toContainText('2026-11')
    await expect(row1).toContainText('2026-12-15')
    await expect(row1).toContainText('8,000.00') // 应收金额
    await expect(row1).toContainText('0.00') // 已收

    const row2 = page.getByTestId('allocation-row-ar-002')
    await expect(row2).toContainText('AR-2026-0002')
    await expect(row2).toContainText('12,000.00')

    // 已结清应收单（ar-003）不进入核销分配表
    await expect(page.getByTestId('allocation-row-ar-003')).toHaveCount(0)
  })

  test('完整登记 + 核销 + 确认流程（15,000.00 = 8,000 + 7,000）', async ({ page }) => {
    await openRegistration(page)
    await chooseCustomer(page, '示例客户 A')
    await page.locator('#actual-amount').fill('15000')
    await page.getByTestId('auto-allocate').click()

    // 自动分配（按到期日优先）写入行输入
    await expect(page.locator('#allocation-input-ar-001')).toHaveValue('8000.00')
    await expect(page.locator('#allocation-input-ar-002')).toHaveValue('7000.00')

    // 实时汇总
    await expect(page.getByTestId('summary-actual')).toHaveText('15,000.00')
    await expect(page.getByTestId('summary-allocated')).toHaveText('15,000.00')
    await expect(page.getByTestId('summary-unallocated')).toHaveText('0.00')

    // 提交前确认信息
    await page.getByTestId('confirm-receipt').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('示例客户 A')
    await expect(dialog).toContainText('15,000.00')
    await expect(dialog).toContainText('AR-2026-0001')
    await expect(dialog).toContainText('8,000.00')
    await expect(dialog).toContainText('AR-2026-0002')
    await expect(dialog).toContainText('7,000.00')
    await dialog.getByRole('button', { name: '确认收款' }).click()

    // 成功结果：收款单 / 流水 / 核销计数
    const result = page.getByTestId('receipt-result')
    await expect(result).toBeVisible()
    await expect(page.getByTestId('result-receipt-no')).toContainText('SK-2026-0009')
    await expect(page.getByTestId('result-transaction-no')).toContainText('FT-2026-0023')
    await expect(page.getByTestId('result-allocation-count')).toHaveText('2 笔')
    // 跳回原应收单 / 相关流水
    await expect(page.getByTestId('result-receivable-link-ar-001')).toBeVisible()
    await expect(page.getByTestId('result-receivable-link-ar-002')).toBeVisible()
    await expect(page.getByTestId('result-transaction-link')).toBeVisible()

    // 成功后列表更新：共 9 条，新收款单行金额与状态
    const table = page.getByTestId('receipt-list-table')
    await expect(table.getByText('共 9 条')).toBeVisible()
    const newRow = table.locator('tbody tr', { hasText: 'SK-2026-0009' })
    await expect(newRow).toHaveCount(1)
    await expect(newRow).toContainText('15,000.00')
    await expect(newRow).toContainText('已全额核销')

    // 未分配列为 0.00（未分配金额恒等于实际收款 − 已核销）
    await expect(newRow.locator('td').nth(6)).toHaveText('0.00')
  })

  test('手动核销与实时汇总', async ({ page }) => {
    await openRegistration(page)
    await chooseCustomer(page, '示例客户 A')
    await page.locator('#actual-amount').fill('10000')
    await page.locator('#allocation-input-ar-001').fill('8000')

    await expect(page.getByTestId('summary-allocated')).toHaveText('8,000.00')
    await expect(page.getByTestId('summary-unallocated')).toHaveText('2,000.00')

    // 清空分配
    await page.getByTestId('clear-allocations').click()
    await expect(page.locator('#allocation-input-ar-001')).toHaveValue('')
    await expect(page.getByTestId('summary-allocated')).toHaveText('0.00')
    await expect(page.getByTestId('summary-unallocated')).toHaveText('10,000.00')

    // 手动分配 ar-002 10,000.00 后确认
    await page.locator('#allocation-input-ar-002').fill('10000')
    await expect(page.getByTestId('summary-allocated')).toHaveText('10,000.00')
    await page.getByTestId('confirm-receipt').click()
    await page.getByRole('dialog').getByRole('button', { name: '确认收款' }).click()
    await expect(page.getByTestId('receipt-result')).toBeVisible()
  })

  test('错误态：超额核销与未分配提示（禁止确认）', async ({ page }) => {
    await openRegistration(page)
    await chooseCustomer(page, '示例客户 A')

    // 未分配 > 0：金额 + Phase 2 说明 + 禁止确认
    await page.locator('#actual-amount').fill('15000')
    await page.locator('#allocation-input-ar-001').fill('8000')
    const warning = page.getByTestId('unallocated-warning')
    await expect(warning).toBeVisible()
    await expect(warning).toContainText('7,000.00')
    await expect(warning).toContainText('Phase 2')
    await expect(warning).toContainText('禁止确认收款')
    await expect(page.getByTestId('confirm-receipt')).toBeDisabled()

    // 超额核销：14,000 < 8,000 + 7,000
    await page.locator('#actual-amount').fill('14000')
    await page.locator('#allocation-input-ar-002').fill('7000')
    await expect(page.getByTestId('allocation-errors')).toContainText('核销总额超过实际收款金额')
    await expect(page.getByTestId('confirm-receipt')).toBeDisabled()

    // 累计核销超过原始应收（ar-001 原始 8,000.00）
    await page.locator('#allocation-input-ar-002').fill('')
    await page.locator('#allocation-input-ar-001').fill('9000')
    await page.locator('#actual-amount').fill('9000')
    await expect(page.getByTestId('allocation-errors')).toContainText('累计核销金额超过应收单原始金额')
    await expect(page.getByTestId('confirm-receipt')).toBeDisabled()
  })

  test('错误态：非法金额阻断提交', async ({ page }) => {
    await openRegistration(page)
    await chooseCustomer(page, '示例客户 A')
    await page.locator('#actual-amount').fill('8000')
    await page.locator('#allocation-input-ar-001').fill('1.234')

    await expect(page.getByText('金额格式不正确')).toBeVisible()
    await expect(page.getByTestId('confirm-receipt')).toBeDisabled()
  })

  test('成功后列表更新与防重复提交（双击仅生成一张收款单）', async ({ page }) => {
    await openRegistration(page)
    await chooseCustomer(page, '示例客户 A')
    await page.locator('#actual-amount').fill('15000')
    await page.getByTestId('auto-allocate').click()
    await page.getByTestId('confirm-receipt').click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    // 快速双击确认（防重复点击）
    await dialog.getByRole('button', { name: '确认收款' }).dblclick()

    await expect(page.getByTestId('receipt-result')).toBeVisible()
    await expect(page.getByTestId('result-receipt-no')).toContainText('SK-2026-0009')
    await expect(page.getByTestId('result-allocation-count')).toHaveText('2 笔')

    // 仅生成一张收款单：共 9 条
    const table = page.getByTestId('receipt-list-table')
    await expect(table.getByText('共 9 条')).toBeVisible()
    await expect(table.locator('tbody tr', { hasText: 'SK-2026-0009' })).toHaveCount(1)

    // 继续登记：A 已结清（ar-001 不在核销表），B 未收 5,000.00
    await page.getByTestId('continue-registration').click()
    await expect(page.getByTestId('allocation-row-ar-001')).toHaveCount(0)
    await expect(page.getByTestId('allocation-row-ar-002')).toContainText('5,000.00')
    await expect(page.getByTestId('allocation-row-ar-002')).toContainText('AR-2026-0002')
  })
})

test.describe('加工费回款 — 跨页路由参数预填', () => {
  test('action=create 预填客户与目标应收单（不预填核销金额）', async ({ page }) => {
    await page.goto(`${PAGE_URL}?action=create&customerId=cust-a&receivableId=ar-002`)

    await expect(page.locator('#receipt-registration')).toBeVisible()
    await expect(page.getByTestId('registration-customer')).toContainText('示例客户 A')

    const target = page.getByTestId('allocation-row-ar-002')
    await expect(target).toBeVisible()
    await expect(target).toHaveClass(/bg-brand-subtle/)
    await expect(target).toContainText('来自应收单')
    // 不误核销：不预填任何核销金额
    await expect(page.locator('#allocation-input-ar-002')).toHaveValue('')
    await expect(page.locator('#allocation-input-ar-001')).toHaveValue('')
    await expect(page.getByTestId('route-notice')).toHaveCount(0)
  })

  test('无效参数安全处理（不存在/跨客户/停用客户）', async ({ page }) => {
    // receivableId 不存在：提示并忽略，客户仍预填
    await page.goto(`${PAGE_URL}?action=create&customerId=cust-a&receivableId=ar-999`)
    await expect(page.getByTestId('route-notice')).toContainText('应收单不存在')
    await expect(page.getByTestId('registration-customer')).toContainText('示例客户 A')
    await expect(page.locator('#allocation-input-ar-001')).toHaveValue('')

    // 跨客户：提示并忽略，核销行只含所选客户（不误核销）
    await page.goto(`${PAGE_URL}?action=create&customerId=cust-b&receivableId=ar-001`)
    await expect(page.getByTestId('route-notice')).toContainText('不属于所选客户')
    await expect(page.getByTestId('allocation-row-ar-001')).toHaveCount(0)
    await expect(page.getByTestId('allocation-row-ar-004')).toBeVisible()

    // 停用客户（示例客户 E）：提示并忽略预填
    await page.goto(`${PAGE_URL}?action=create&customerId=cust-e&receivableId=ar-024`)
    await expect(page.getByTestId('route-notice')).toContainText('已停用')
  })

  test('action 非 create：不展开登记表单并提示', async ({ page }) => {
    await page.goto(`${PAGE_URL}?action=delete&customerId=cust-a`)
    await expect(page.getByTestId('route-notice')).toContainText('action')
    await expect(page.locator('#receipt-registration')).toHaveCount(0)
    // 列表仍可用
    await expect(page.getByTestId('receipt-list-table').getByText('共 8 条')).toBeVisible()
  })
})

test.describe('加工费回款 — 移动端 390×844', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })

  test('移动端可完成核销登记且无页面横向溢出', async ({ page }) => {
    await openRegistration(page)
    await chooseCustomer(page, '示例客户 A')

    // 核销操作区改为堆叠卡片布局（390px 可完成核销操作）
    const cards = page.getByTestId('allocation-cards')
    await expect(cards).toBeVisible()
    await expect(page.getByTestId('allocation-row-ar-001')).toBeVisible()

    await page.locator('#actual-amount').fill('15000')
    await page.getByTestId('auto-allocate').click()
    await expect(page.locator('#allocation-input-ar-001')).toHaveValue('8000.00')
    await expect(page.locator('#allocation-input-ar-002')).toHaveValue('7000.00')
    await expect(page.getByTestId('summary-unallocated')).toHaveText('0.00')

    await page.getByTestId('confirm-receipt').click()
    await page.getByRole('dialog').getByRole('button', { name: '确认收款' }).click()
    await expect(page.getByTestId('result-receipt-no')).toContainText('SK-2026-0009')

    // 无非预期页面横向溢出（宽表格在容器内滚动）
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1)
  })
})
