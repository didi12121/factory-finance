import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, test, type Page } from '@playwright/test'

const outputDir = fileURLToPath(new URL('../../artifacts/screenshots/phase-0.1/', import.meta.url))

async function settle(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(200)
}

test.describe('Phase 0.1 截图（真实浏览器）', () => {
  test.beforeAll(() => {
    mkdirSync(outputDir, { recursive: true })
  })

  test('生成 Application Shell 四档视口截图', async ({ page }) => {
    const shots: Array<{ width: number; height: number; name: string }> = [
      { width: 1920, height: 1080, name: 'shell-1920x1080.png' },
      { width: 1440, height: 900, name: 'shell-1440x900.png' },
      { width: 1280, height: 800, name: 'shell-1280x800.png' },
      { width: 390, height: 844, name: 'shell-mobile-390x844.png' },
    ]

    for (const shot of shots) {
      await page.setViewportSize({ width: shot.width, height: shot.height })
      await page.goto('/workbench')
      await settle(page)
      await expect(page.getByRole('heading', { name: '经营概览' })).toBeVisible()
      await page.screenshot({ path: path.join(outputDir, shot.name), fullPage: true })
    }
  })

  test('生成 Design System 页面截图', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/dev/design-system')
    await settle(page)
    await expect(page.getByRole('heading', { name: 'Color Tokens' })).toBeVisible()
    await page.screenshot({ path: path.join(outputDir, 'design-system.png'), fullPage: true })
  })

  test('生成 DataTable 截图', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/dev/design-system')
    await settle(page)
    const table = page.locator('[data-testid="data-table"]')
    await table.scrollIntoViewIfNeeded()
    await table.screenshot({ path: path.join(outputDir, 'data-table.png') })
  })

  test('生成 Dialog 打开状态截图', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/dev/design-system')
    await settle(page)
    await page.locator('[data-testid="dialog-open"]').click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.screenshot({ path: path.join(outputDir, 'dialog.png') })
  })

  test('生成 DetailSheet 打开状态截图', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/dev/design-system')
    await settle(page)
    await page.locator('[data-testid="sheet-open"]').click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.screenshot({ path: path.join(outputDir, 'detail-sheet.png') })
  })
})
