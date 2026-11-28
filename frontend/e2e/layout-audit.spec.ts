import { expect, test, type Page } from '@playwright/test'

import { createCustomer, today, uniqueSuffix } from './business-fixtures'

/**
 * Phase 0.3 布局审计（真实浏览器）：
 *
 * 1. sticky Header 截图伪影判定：Header 真实布局 sticky top-0（滚动时 rect.top 恒为 0），
 *    fullPage 截图中"Header 出现在页面中部"为截图采集伪影（滚动态拼接/裁剪位置）；
 *    本文件输出 A/B 证据截图（滚动态 vs 回到页首），截图采集流程已统一 scrollTop=0。
 * 2. 页面级横向溢出根因审计：运行时移除布局容器的 overflow-x-clip 防护后，
 *    四档视口下各页面仍无页面级横向溢出（证明没有被 clip 遮盖的真实布局错误）。
 */

const PAGES = [
  { path: '/workbench', ready: 'metric-fundBalance' },
  { path: '/treasury/transactions', ready: 'transactions-table' },
  { path: '/business/receivables', ready: 'receivables-table' },
  { path: '/business/processing-fee', ready: 'receipt-list' },
] as const

const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
] as const

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
}

/** 运行时解除 overflow-x-clip 防护（布局文件只读，审计在运行时进行），返回被解除的元素数 */
async function disableOverflowClipGuard(page: Page): Promise<number> {
  return page.evaluate(() => {
    let touched = 0
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('div, main, section'))) {
      if (getComputedStyle(el).overflowX === 'clip') {
        el.style.overflowX = 'visible'
        touched += 1
      }
    }
    return touched
  })
}

test.describe('sticky Header 截图伪影判定（真实布局 vs 采集伪影）', () => {
  test('滚动时 Header 恒贴视口顶部；A/B 证据截图证明中部 Header 为采集伪影', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/business/receivables')
    await expect(page.getByTestId('receivables-table')).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(250)

    const header = page.locator('[data-testid="header"]')

    // 真实布局证据：无论滚动与否，sticky Header 的视口矩形顶部恒为 0
    const topAtScroll0 = await header.evaluate((el) => el.getBoundingClientRect().top)
    expect(topAtScroll0).toBe(0)
    await page.evaluate(() => window.scrollTo(0, 600))
    await page.waitForTimeout(150)
    const topAfterScroll = await header.evaluate((el) => el.getBoundingClientRect().top)
    expect(topAfterScroll).toBe(0)
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0)

    // 证据 A（历史采集方式：滚动态直接 fullPage）→ Header 位置随滚动偏移（伪影来源）
    await page.screenshot({ path: 'test-results/qa/header-artifact-scrolled.png', fullPage: true })

    // 证据 B（修正采集方式：scrollTop=0 后 fullPage）→ Header 回到图首
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(150)
    expect(await page.evaluate(() => window.scrollY)).toBe(0)
    await page.screenshot({ path: 'test-results/qa/header-artifact-scrolled-fixed.png', fullPage: true })

    // 结论：sticky + fullPage 拼接/裁剪的截图采集伪影；真实布局无问题（rect.top 恒 0）
  })
})

test.describe('页面级横向溢出根因审计（禁用 overflow-x-clip 防护）', () => {
  for (const viewport of VIEWPORTS) {
    test(`${viewport.width}×${viewport.height} 四页面无被遮盖的真实溢出`, async ({ page }) => {
      await page.setViewportSize(viewport)
      for (const target of PAGES) {
        await page.goto(target.path)
        await expect(page.getByTestId(target.ready)).toBeVisible()
        await page.evaluate(() => document.fonts.ready)
        await page.waitForTimeout(150)

        const guarded = await disableOverflowClipGuard(page)
        // 基线布局含 overflow-x-clip 防护；解除后仍不得出现页面级横向溢出
        const overflow = await horizontalOverflow(page)
        expect(overflow, `${target.path} @${viewport.width} 存在被 clip 遮盖的真实横向溢出（防护元素数 ${guarded}）`).toBeLessThanOrEqual(0)
      }
    })
  }
})

test.describe('长金额渲染（大额应收单不破坏布局）', () => {
  test('16 位整数金额在 390px 下完整可读且无横向溢出', async ({ page, request }) => {
    const customer = await createCustomer(request, `长金额客户-${uniqueSuffix()}`)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/business/receivables')
    await expect(page.getByTestId('receivables-table')).toBeVisible()

    await page.getByTestId('create-receivable-open').click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('客户', { exact: true }).click()
    await page.getByRole('option', { name: customer.name, exact: true }).click()
    await dialog.getByLabel('所属月份', { exact: true }).fill(today().slice(0, 7))
    await dialog.getByLabel('对账日期').fill(today())
    await dialog.locator('#create-amount').fill('9,999,999,999,999,999.99')
    await page.getByTestId('create-receivable-submit').click()
    await expect(dialog).toBeHidden()

    await page.getByPlaceholder('搜索单据编号或客户…').fill(customer.name)
    const row = page.getByTestId('receivables-table').locator('tbody tr').first()
    await expect(row).toContainText('9,999,999,999,999,999.99')
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
  })
})
