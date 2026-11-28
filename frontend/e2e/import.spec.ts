import { expect, test } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { buildXlsx } from './xlsx-fixture'

/**
 * 数据迁移页面（真实浏览器 + 真实后端）：
 * 侧边栏进入 → 模板下载 → 上传 → 预览 → 确认导入 → 批次记录。
 *
 * 覆盖审核项 §1：ImportView 路由注册与真实业务流程可用。
 */

test.describe('数据迁移（Excel 导入）', () => {
  test('侧边栏进入数据迁移，完成模板下载、上传、预览与确认导入', async ({ page }) => {
    const suffix = Date.now().toString(36)
    const customerName = `导入核查客户-${suffix}`
    const fixtureDir = path.join('test-results', 'fixtures')
    mkdirSync(fixtureDir, { recursive: true })
    const fixturePath = path.join(fixtureDir, `import-customer-${suffix}.xlsx`)
    writeFileSync(
      fixturePath,
      buildXlsx(
        ['客户名称', '联系人', '电话', '备注'],
        [[customerName, '张三', '13800001111', '浏览器验收']],
      ),
    )

    // 1) 从侧边栏进入（验证路由注册 + 鉴权）
    await page.goto('/workbench')
    await page.getByRole('link', { name: '数据迁移' }).click()
    await expect(page).toHaveURL(/\/business\/import$/)
    const importPage = page.getByTestId('import-page')
    await expect(importPage).toBeVisible()

    // 2) 模板下载
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('download-template').click(),
    ])
    expect(download.suggestedFilename()).toContain('.xlsx')

    // 3) 上传文件并预览（预览不落库）
    await page.getByTestId('import-file').setInputFiles(fixturePath)
    await page.getByTestId('preview-import').click()
    const preview = page.getByTestId('import-preview')
    await expect(preview).toBeVisible()
    await expect(preview).toContainText('可导入')

    // 4) 确认导入
    await page.getByTestId('confirm-import').click()
    const result = page.getByTestId('import-result')
    await expect(result).toBeVisible()
    await expect(result).toContainText('成功')
    await expect(page.getByTestId('import-batches')).toContainText('IMP-')

    // 5) 数据已进入业务列表（客户管理可见）
    await page.goto('/masterdata/customers')
    await expect(page.getByTestId('customers-table')).toContainText(customerName)
  })
})
