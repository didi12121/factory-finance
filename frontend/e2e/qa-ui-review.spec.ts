import { expect, test, type Page } from '@playwright/test'

/**
 * Phase 0.3 Agent D 独立 UI Review（真实浏览器，桌面 1920/1440/1280 + 移动 390）。
 *
 * C1 经营概览列表 ≤8（移动 ≤5）与列平衡；C2 日期组件（手动/日历/清空/键盘/校验/闰年/区间）；
 * C3 侧栏（降噪/详情页父级高亮/能力一致）；C4 表格（流入流出语义/对齐/编号可点击视觉）；
 * C5 响应式（运行时解除 overflow-x-clip 后仍无真实横向溢出——独立复核 layout-audit 结论）；
 * C6 一致性（无渐变/阴影堆砌/Emoji/营销文案）。
 * 每档视口输出真实浏览器截图至 test-results/qa/（审核证据）。
 */

const PAGES = [
  { path: '/workbench', ready: 'metric-fund-balance', name: 'dashboard' },
  { path: '/treasury/transactions', ready: 'transactions-table', name: 'transactions' },
  { path: '/business/receivables', ready: 'receivables-table', name: 'receivables' },
  { path: '/business/processing-fee', ready: 'receipt-list-table', name: 'receipts' },
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

/* ==================== C1 列表条数 ≤8 与列平衡 ==================== */

test.describe('C1 经营概览列表条数与列平衡', () => {
  test('桌面 1920：近期流水/待收单据各 ≤8 条，双列面板等宽平衡', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.goto('/workbench')
    await expect(page.getByTestId('metric-fund-balance')).toBeVisible()

    const recentRows = page.getByTestId('recent-transaction-row')
    const pendingRows = page.getByTestId('pending-receivable-row')
    await expect(recentRows).toHaveCount(8)
    await expect(pendingRows).toHaveCount(8)

    // 列平衡：两个列表面板同排等宽（差 < 8%）
    const recentBox = await page.getByTestId('recent-transactions').boundingBox()
    const pendingBox = await page.getByTestId('pending-receivables').boundingBox()
    expect(recentBox).not.toBeNull()
    expect(pendingBox).not.toBeNull()
    expect(Math.abs(recentBox!.y - pendingBox!.y)).toBeLessThanOrEqual(8)
    const widthDiff = Math.abs(recentBox!.width - pendingBox!.width) / Math.max(recentBox!.width, pendingBox!.width)
    expect(widthDiff, `双列宽度差 ${widthDiff}`).toBeLessThan(0.08)
  })

  test('移动 390：列表 ≤5 条（展示层截取，不改写数据）', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/workbench')
    await expect(page.getByTestId('metric-fund-balance')).toBeVisible()
    await expect(page.getByTestId('recent-transaction-row')).toHaveCount(5)
    await expect(page.getByTestId('pending-receivable-row')).toHaveCount(5)
  })
})

/* ==================== C2 日期组件行为 ==================== */

test.describe('C2 统一日期组件（手动/日历/清空/键盘/校验/闰年/区间）', () => {
  test('登记回款日期：闰年校验、max 限制、清空必填、日历点选、键盘 ESC', async ({ page }) => {
    await page.goto('/business/processing-fee')
    await page.getByTestId('open-registration').click()
    await expect(page.locator('#receipt-registration')).toBeVisible()

    // 手动输入 + 闰年校验：2025-02-29 不存在；2024-02-29 合法
    await page.locator('#receipt-date').fill('2025-02-29')
    await page.locator('#receipt-date').blur()
    await expect(page.locator('#receipt-date-input-error')).toContainText('日期不存在')
    await page.locator('#receipt-date').fill('2024-02-29')
    await expect(page.locator('#receipt-date-input-error')).toHaveCount(0)

    // max 限制（UI max 与 Domain 强制一致）：晚于 2026-11-30 报错
    await page.locator('#receipt-date').fill('2026-12-05')
    await page.locator('#receipt-date').blur()
    await expect(page.locator('#receipt-date-input-error')).toContainText('日期不得晚于 2026-11-30')

    // 清空（必填提示）→ 恢复合法值
    await page.locator('#receipt-registration').getByRole('button', { name: '清空日期' }).click()
    await page.locator('#receipt-date').blur()
    await expect(page.locator('#receipt-date-input-error')).toContainText('请输入业务日期')
    await page.locator('#receipt-date').fill('2026-11-30')
    await expect(page.locator('#receipt-date-input-error')).toHaveCount(0)

    // 日历点选回填 + 键盘（Enter 打开 / ESC 关闭）
    const trigger = page.locator('#receipt-registration').getByRole('button', { name: '打开日历' })
    await trigger.click()
    const popover = page.getByTestId('date-picker-popover')
    await expect(popover).toBeVisible()
    await popover.getByRole('button', { name: /2026年11月15日/ }).click()
    await expect(page.locator('#receipt-date')).toHaveValue('2026-11-15')
    await trigger.focus()
    await page.keyboard.press('Enter')
    await expect(popover).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(popover).toBeHidden()
  })

  test('日期区间：顺序校验 + 真实过滤（资金流水）', async ({ page }) => {
    await page.goto('/treasury/transactions')
    await expect(page.getByTestId('transactions-table')).toBeVisible()
    await page.getByLabel('交易开始日期').fill('2026-11-10')
    await page.getByLabel('交易结束日期').fill('2026-11-01')
    await expect(page.locator('[id$="-range-error"]').first()).toContainText('开始日期不得晚于结束日期')
    await page.getByLabel('交易开始日期').fill('2026-11-01')
    await page.getByLabel('交易结束日期').fill('2026-11-10')
    await expect(page.getByTestId('transactions-table').getByText('共 4 条')).toBeVisible()
  })
})

/* ==================== C3 侧栏（降噪/父级高亮/能力一致） ==================== */

test.describe('C3 侧边导航', () => {
  test('详情页父级高亮、能力标注一致、无逐项噪音', async ({ page }) => {
    // 详情页（/business/receivables/ar-001）父级「应收账款」保持高亮
    await page.goto('/business/receivables/ar-001')
    await expect(page.getByTestId('receivable-detail-page')).toBeVisible()
    const currentLinks = page.locator('[aria-current="page"]')
    const labels = await currentLinks.allInnerTexts()
    expect(labels.some((text) => text.includes('应收账款'))).toBe(true)
    expect(labels.some((text) => text.includes('应付账款'))).toBe(false)

    // 降噪与能力一致：整组未实现仅分组级「规划中」×3，无逐项「未实现」噪音
    const sidebar = page.getByTestId('sidebar')
    await expect(sidebar.getByText('规划中')).toHaveCount(3)
    await expect(sidebar.getByText('未实现')).toHaveCount(0)
    // 已交付原型页正常可达
    for (const label of ['经营概览', '资金流水', '应收账款', '加工费回款']) {
      await expect(sidebar.getByRole('link', { name: label, exact: true })).toBeVisible()
    }
  })
})

/* ==================== C4 表格（流入/流出语义、对齐、编号可点击视觉） ==================== */

test.describe('C4 资金流水与应收表格', () => {
  test('流入/流出双列语义 + 金额右对齐 tabular-nums + 编号可点击视觉', async ({ page }) => {
    await page.goto('/treasury/transactions')
    const table = page.getByTestId('transactions-table')
    await expect(table).toBeVisible()

    // 流入/流出语义：双列语义（资金事实列名），方向决定金额落列
    await expect(page.getByRole('columnheader', { name: '流入金额' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: '流出金额' })).toBeVisible()

    // 流入行：流入金额有值、流出列 —（FT-2026-0013 加工费回款 IN 6,500.00）
    const inRow = table.locator('tbody tr', { hasText: 'FT-2026-0013' })
    await expect(inRow.locator('td').nth(5)).toHaveText('6,500.00')
    await expect(inRow.locator('td').nth(6)).toHaveText('—')
    // 流出行：流出金额有值、流入列 —（FT-2026-0022 工资 OUT 29,500.00）
    const outRow = table.locator('tbody tr', { hasText: 'FT-2026-0022' })
    await expect(outRow.locator('td').nth(5)).toHaveText('—')
    await expect(outRow.locator('td').nth(6)).toHaveText('29,500.00')

    // 详情方向语义（流入 IN / 流出 OUT 文字标签，非仅颜色）
    await page.getByRole('button', { name: '查看 FT-2026-0013 详情' }).click()
    const sheet = page.getByRole('dialog')
    await expect(sheet).toBeVisible()
    await expect(sheet).toContainText('流入（IN）')
    await sheet.getByRole('button', { name: '关闭详情面板' }).click()

    // 金额对齐：右对齐 + tabular-nums（.amount 全局金额展示规范）
    const amountSpan = inRow.locator('td').nth(5).locator('span.amount')
    expect(await amountSpan.evaluate((el) => getComputedStyle(el).textAlign)).toBe('right')
    expect(
      await amountSpan.evaluate((el) => getComputedStyle(el).fontVariantNumeric),
    ).toContain('tabular-nums')

    // 编号可点击视觉：应收对账单编号使用链接视觉（语义前景色）并可点击进详情
    await page.goto('/business/receivables')
    await expect(page.getByTestId('receivables-table')).toBeVisible()
    const docNo = page
      .getByTestId('receivables-table')
      .locator('tbody tr', { hasText: 'AR-2026-0001' })
      .locator('td')
      .first()
    await expect(docNo).toContainText('AR-2026-0001')
    expect(
      await docNo.evaluate((el) =>
        Array.from(el.querySelectorAll('span')).some((span) =>
          span.className.includes('text-brand-foreground'),
        ),
      ),
    ).toBe(true)
  })
})

/* ============ C5 响应式：解除 overflow-x-clip 后仍无真实横向溢出（独立复核） ============ */

test.describe('C5 四档视口真实溢出审计（overflow-x-clip 解除）', () => {
  for (const viewport of VIEWPORTS) {
    test(`${viewport.width}×${viewport.height} 四页面无被 clip 遮盖的真实溢出`, async ({ page }) => {
      await page.setViewportSize(viewport)
      for (const target of PAGES) {
        await page.goto(target.path)
        await expect(page.getByTestId(target.ready)).toBeVisible()
        await page.evaluate(() => document.fonts.ready)
        await page.waitForTimeout(150)
        const guarded = await disableOverflowClipGuard(page)
        const overflow = await horizontalOverflow(page)
        expect(
          overflow,
          `${target.path} @${viewport.width} 存在被 clip 遮盖的真实横向溢出（防护元素数 ${guarded}）`,
        ).toBeLessThanOrEqual(0)
      }
    })
  }
})

/* ==================== C6 一致性（无渐变/阴影堆砌/Emoji/营销文案） ==================== */

test.describe('C6 视觉一致性红线', () => {
  test('四页面无渐变/阴影堆砌/Emoji/营销文案（1920）', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    for (const target of PAGES) {
      await page.goto(target.path)
      await expect(page.getByTestId(target.ready)).toBeVisible()
      await page.evaluate(() => document.fonts.ready)

      const audit = await page.evaluate(() => {
        const emojiRe = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u
        const marketing = ['赋能', '立即体验', '一键生成', '让财务更简单', '一站式', '智能提升']
        const gradients: string[] = []
        const shadows: string[] = []
        const root = document.querySelector('main') ?? document.body
        for (const el of Array.from(root.querySelectorAll<HTMLElement>('div, section, ul, li, table, td, th, button, span, p, h1, h2'))) {
          const style = getComputedStyle(el)
          if (style.backgroundImage.includes('gradient')) {
            gradients.push(el.tagName + '.' + el.className.slice(0, 40))
          }
          if (style.boxShadow !== 'none') {
            shadows.push(el.tagName + '.' + el.className.slice(0, 40))
          }
        }
        const text = root.textContent ?? ''
        return {
          gradients,
          shadows,
          hasEmoji: emojiRe.test(text),
          marketingHits: marketing.filter((word) => text.includes(word)),
        }
      })
      expect(audit.gradients, `${target.path} 出现渐变`).toEqual([])
      expect(audit.shadows, `${target.path} 出现阴影堆砌`).toEqual([])
      expect(audit.hasEmoji, `${target.path} 出现 Emoji`).toBe(false)
      expect(audit.marketingHits, `${target.path} 出现营销文案`).toEqual([])
    }
  })
})

/* ==================== UI Review 证据截图（四档视口 × 四页面） ==================== */

test.describe('UI Review 证据截图（1920/1440/1280/390）', () => {
  for (const viewport of VIEWPORTS) {
    test(`截图 ${viewport.width}×${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport)
      for (const target of PAGES) {
        await page.goto(target.path)
        await expect(page.getByTestId(target.ready)).toBeVisible()
        await page.evaluate(() => document.fonts.ready)
        await page.waitForTimeout(200)
        await page.evaluate(() => window.scrollTo(0, 0))
        await page.screenshot({
          path: `test-results/qa/ui-review-${target.name}-${viewport.width}.png`,
          fullPage: true,
        })
      }
    })
  }
})
