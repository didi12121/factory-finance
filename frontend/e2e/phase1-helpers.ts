/**
 * Phase 1 E2E 公共支撑（供集成阶段运行）。
 *
 * 运行前提（集成阶段全栈环境）：
 * - 前端构建（build:test + preview 或 dev server）可访问真实后端 /api/v1；
 * - 已初始化管理员账号：环境变量 PHASE1_E2E_USERNAME / PHASE1_E2E_PASSWORD
 *   （缺省 admin / admin123，集成阶段按实际种子账号覆盖）。
 */

import { expect, type Page } from '@playwright/test'

export const E2E_USERNAME = process.env.PHASE1_E2E_USERNAME ?? 'admin'
export const E2E_PASSWORD = process.env.PHASE1_E2E_PASSWORD ?? 'admin123'

/** 本次运行唯一后缀（业务名称/备注可断言定位） */
export function runId(): string {
  return Date.now().toString(36).slice(-6)
}

/** 金额字符串（千分位格式化）→ 分（BigInt 精确，禁止 Number 财务运算） */
export function moneyToCents(text: string): bigint {
  const cleaned = text.replace(/,/g, '').trim()
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned)
  if (match === null) {
    throw new Error(`非法金额文本: ${text}`)
  }
  const sign = match[1] === '-' ? -1n : 1n
  const frac = (match[3] ?? '').padEnd(2, '0')
  return sign * (BigInt(match[2]) * 100n + BigInt(frac))
}

/** 分（BigInt）→ 千分位金额字符串（断言期望值） */
export function centsToMoney(cents: bigint): string {
  const sign = cents < 0n ? '-' : ''
  const abs = cents < 0n ? -cents : cents
  const yuan = (abs / 100n).toString()
  const frac = (abs % 100n).toString().padStart(2, '0')
  const grouped = yuan.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${sign}${grouped}.${frac}`
}

/** 浏览器本地业务日期（YYYY-MM-DD，Asia/Shanghai 浏览器上下文） */
export async function businessToday(page: Page): Promise<string> {
  return page.evaluate(() => {
    const now = new Date()
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    const dd = String(now.getDate()).padStart(2, '0')
    return `${now.getFullYear()}-${mm}-${dd}`
  })
}

/** UI 登录（登录页表单） */
export async function login(page: Page): Promise<void> {
  await page.goto('/login')
  await page.getByTestId('login-username').fill(E2E_USERNAME)
  await page.getByTestId('login-password').fill(E2E_PASSWORD)
  await page.getByTestId('login-submit').click()
  // 等待成功跳转到工作台（而非停留在 /login——避免模式同时匹配起点）
  await page.waitForURL(/\/workbench/, { timeout: 15_000 })
  // 登录失败时立即暴露（避免后续步骤静默错位）
  await expect(page.getByTestId('login-error')).toHaveCount(0)
}

/** reka-ui Select 选择（按 aria-label 定位触发器） */
export async function selectOption(page: Page, ariaLabel: string, optionText: string): Promise<void> {
  await page.getByRole('combobox', { name: ariaLabel }).click()
  await page.getByRole('option', { name: optionText }).click()
}

/** 在行内点击操作按钮（先按唯一关键字筛选定位行） */
export async function actionInRow(page: Page, rowKeyword: string, testId: string): Promise<void> {
  const row = page.locator('tr', { hasText: rowKeyword }).first()
  await row.getByTestId(testId).click()
}

/** 对话框提交（按提交按钮文案） */
export async function submitDialog(page: Page, submitText: string): Promise<void> {
  const dialog = page.locator('[role="dialog"]').last()
  await dialog.getByRole('button', { name: submitText }).click()
}

/** 表单字段输入（FormDialog schema 字段：#form-<key>） */
export async function fillFormField(page: Page, key: string, value: string): Promise<void> {
  await page.locator(`#form-${key}`).fill(value)
}
