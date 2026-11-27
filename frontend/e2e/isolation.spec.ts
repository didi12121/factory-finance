import { expect, test, type Page } from '@playwright/test'

/**
 * 演示/原型环境隔离 E2E（Phase 0.3 Task B2）。
 *
 * 同一断言套件分别对**生产构建**与**staging 构建**的 preview 运行
 * （playwright.isolation.config.ts 两个 project = 两种 mode 产物）。
 * 断言目标：
 *   1. 演示路由（/workbench、/treasury/transactions、/business/receivables、
 *      /business/receivables/ar-001、/business/processing-fee、/dev/design-system）
 *      全部安全回退 /workbench（/workbench 自身为安全占位页，非演示看板）；
 *   2. 模拟收款确认不可执行（登记/确认入口与表单一律不可达）；
 *   3. 正常 App Shell（侧边栏 / Header / 导航）仍可用，占位页面可正常访问；
 *   4. 页面渲染文本不含任何虚构 Fixture / Mock Store / Design System 演示内容。
 */

/** 演示业务/Design System 路由：必须安全回退 /workbench */
const DEMO_ROUTES = [
  '/treasury/transactions',
  '/business/receivables',
  '/business/receivables/ar-001',
  '/business/processing-fee',
  '/dev/design-system',
]

/** 渲染层禁用文本（虚构 Fixture / Mock Store / Design System 展示页特征） */
const FORBIDDEN_TEXTS = [
  '虚构',
  '示例客户',
  '示例供应商',
  '示例股东',
  'DEMO_TODAY',
  '2026-11-30',
  'AR-2026-',
  'SK-2026-',
  'FT-2026-',
  'demo-rc-',
  'Color Tokens',
  'XS-2026-',
  '登记回款',
  '确认收款',
  '收款单',
]

/** 模拟收款确认相关入口/表单（演示业务实现，隔离下不可达） */
const RECEIPT_TESTIDS = ['open-registration', 'confirm-receipt', 'receipt-list', 'registration-customer', 'receipt-result']

/**
 * 本套件仅适用于非允许清单构建（playwright.isolation.config.ts 的
 * production-build / staging-build 两个 project）。
 * 主套件 playwright.config.ts（test 模式构建，按设计**包含**演示内容）也会拾取
 * e2e/isolation.spec.ts，此时断言不适用，运行时跳过（既有主套件用例保持全绿）。
 */
const ISOLATION_PROJECTS = new Set(['production-build', 'staging-build'])

function skipUnlessIsolationProject(): void {
  test.skip(
    !ISOLATION_PROJECTS.has(test.info().project.name),
    '本套件仅适用于非允许清单构建（playwright.isolation.config.ts）；test 模式演示构建不适用',
  )
}

async function expectNoDemoContent(page: Page): Promise<void> {
  const body = page.locator('body')
  for (const text of FORBIDDEN_TEXTS) {
    await expect(body, `页面不应出现演示内容：${text}`).not.toContainText(text)
  }
  for (const testid of RECEIPT_TESTIDS) {
    await expect(page.locator(`[data-testid="${testid}"]`), `模拟收款入口不可达：${testid}`).toHaveCount(0)
  }
}

test.describe('环境隔离：演示/原型内容不可用（生产构建 + staging 构建）', () => {
  test('App Shell 正常可用，/workbench 安全回退占位页', async ({ page }) => {
    skipUnlessIsolationProject()
    await page.goto('/workbench')

    // 正常 App Shell
    await expect(page).toHaveTitle(/工厂财务/)
    await expect(page.locator('[data-testid="sidebar"]')).toBeVisible()
    await expect(page.locator('[data-testid="header"]')).toBeVisible()
    await expect(page.getByText('资金管理')).toBeVisible()
    await expect(page.getByText('业务管理')).toBeVisible()

    // /workbench 自身安全回退：占位页（非演示看板）
    await expect(page.getByRole('heading', { name: '经营概览' })).toBeVisible()
    await expect(page.getByText('该功能尚未实现')).toBeVisible()
    await expectNoDemoContent(page)
  })

  test('演示路由全部安全回退 /workbench', async ({ page }) => {
    skipUnlessIsolationProject()
    for (const route of DEMO_ROUTES) {
      await page.goto(route)
      await expect(page, `演示路由应安全回退：${route}`).toHaveURL(/\/workbench/)
      await expect(page.getByRole('heading', { name: '经营概览' })).toBeVisible()
      await expect(page.getByText('该功能尚未实现')).toBeVisible()
      await expectNoDemoContent(page)
    }
  })

  test('/dev/design-system 展示页不可用（含演示展示内容）', async ({ page }) => {
    skipUnlessIsolationProject()
    await page.goto('/dev/design-system')
    await expect(page).toHaveURL(/\/workbench/)
    await expect(page.getByRole('heading', { name: 'Color Tokens' })).toHaveCount(0)
    await expectNoDemoContent(page)
  })

  test('模拟收款确认不可执行（登记/确认入口全部不可达）', async ({ page }) => {
    skipUnlessIsolationProject()
    await page.goto('/business/processing-fee')
    await expect(page).toHaveURL(/\/workbench/)
    await expectNoDemoContent(page)

    // 经侧边栏导航再次尝试进入演示回款页：仍安全回退，无登记表单
    const sidebar = page.locator('[data-testid="sidebar"]')
    await sidebar.getByRole('link', { name: /加工费回款/ }).click()
    await expect(page).toHaveURL(/\/workbench/)
    await expect(page.getByText('该功能尚未实现')).toBeVisible()
    await expectNoDemoContent(page)
  })

  test('正常 App Shell 导航仍可用（占位页面可达）', async ({ page }) => {
    skipUnlessIsolationProject()
    await page.goto('/workbench')
    const sidebar = page.locator('[data-testid="sidebar"]')

    await sidebar.getByRole('link', { name: /资金账户/ }).click()
    await expect(page).toHaveURL(/\/treasury\/accounts/)
    await expect(page.getByRole('heading', { name: '资金账户' })).toBeVisible()
    await expect(page.getByText('该功能尚未实现')).toBeVisible()

    await sidebar.getByRole('link', { name: /股东往来/ }).click()
    await expect(page).toHaveURL(/\/business\/shareholder/)
    await expect(page.getByRole('heading', { name: '股东往来' })).toBeVisible()
    await expectNoDemoContent(page)
  })
})
