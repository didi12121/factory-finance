/**
 * E2E 业务夹具：通过真实后端 API 准备前置数据（客户/账户/供应商），
 * 供真实浏览器用例验证页面与数据库一致性。
 *
 * 认证：复用 global-setup 写入的 storageState 中的 Bearer 令牌（与页面登录态一致）。
 */

import { readFileSync } from 'node:fs'

import type { APIRequestContext } from '@playwright/test'

interface StoredSession {
  accessToken: string
}

/** 从全局登录态读取访问令牌 */
export function apiToken(): string {
  const state = JSON.parse(readFileSync('test-results/.auth/state.json', 'utf8')) as {
    origins: { localStorage: { name: string; value: string }[] }[]
  }
  const entry = state.origins[0]?.localStorage.find((item) => item.name === 'factory-finance.auth')
  if (entry === undefined) {
    throw new Error('未找到登录态，无法准备业务夹具')
  }
  return (JSON.parse(entry.value) as StoredSession).accessToken
}

function headers(): Record<string, string> {
  return { Authorization: `Bearer ${apiToken()}` }
}

/** 唯一后缀（同一数据库多次执行用例不冲突） */
export function uniqueSuffix(): string {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`
}

/** 业务日期（今天，YYYY-MM-DD，Asia/Shanghai） */
export function today(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/** 当前会计月份（YYYY-MM） */
export function currentMonth(): string {
  return today().slice(0, 7)
}

/** 幂等键（8-96 位字母数字/短横线） */
export function idempotencyKey(prefix: string): string {
  return `${prefix}-${uniqueSuffix()}-${Math.floor(Math.random() * 1e6)}`
}

export interface ApiResult<T> {
  status: number
  code: string
  data: T
  message: string
}

async function read<T>(response: {
  status(): number
  json(): Promise<{ code: string; data: T; message: string }>
}): Promise<ApiResult<T>> {
  const payload = await response.json()
  return { status: response.status(), code: payload.code, data: payload.data, message: payload.message }
}

export async function apiPost<T>(
  request: APIRequestContext,
  path: string,
  body: unknown,
): Promise<ApiResult<T>> {
  return read<T>(await request.post(`/api/v1${path}`, { headers: headers(), data: body }))
}

export async function apiGet<T>(
  request: APIRequestContext,
  path: string,
  params?: Record<string, string | number | boolean>,
): Promise<ApiResult<T>> {
  return read<T>(await request.get(`/api/v1${path}`, { headers: headers(), params }))
}

/* ------------------------------ 数据构造 ------------------------------ */

export async function createCustomer(request: APIRequestContext, name: string): Promise<{ id: string; name: string }> {
  const result = await apiPost<{ id: string; name: string }>(request, '/masterdata/customers', { name })
  if (result.status !== 200) {
    throw new Error(`创建客户失败：${result.status} ${result.message}`)
  }
  return result.data
}

export async function createAccount(
  request: APIRequestContext,
  name: string,
  openingBalance = '0.00',
): Promise<{ id: string; name: string }> {
  const result = await apiPost<{ id: string; name: string }>(request, '/treasury/accounts', {
    name,
    accountType: 'BANK',
    openingBalance,
    openingDate: today(),
  })
  if (result.status !== 200) {
    throw new Error(`创建资金账户失败：${result.status} ${result.message}`)
  }
  return result.data
}

export async function createSupplier(request: APIRequestContext, name: string): Promise<{ id: string; name: string }> {
  const result = await apiPost<{ id: string; name: string }>(request, '/masterdata/suppliers', { name })
  if (result.status !== 200) {
    throw new Error(`创建供应商失败：${result.status} ${result.message}`)
  }
  return result.data
}

export interface ReceivableFixture {
  id: string
  statementNo: string
  amount: string
}

export async function createReceivable(
  request: APIRequestContext,
  payload: { customerId: string; amount: string; dueDate?: string | null; label: string },
): Promise<ReceivableFixture> {
  const result = await apiPost<{ id: string; statementNo: string; originalAmount: string }>(
    request,
    '/receivable/receivables',
    {
      customerId: Number(payload.customerId),
      accountingMonth: currentMonth(),
      statementDate: today(),
      dueDate: payload.dueDate ?? null,
      amount: payload.amount,
      remark: payload.label,
      idempotencyKey: idempotencyKey('ar'),
    },
  )
  if (result.status !== 200) {
    throw new Error(`创建应收单失败：${result.status} ${result.message}`)
  }
  return { id: result.data.id, statementNo: result.data.statementNo, amount: result.data.originalAmount }
}

/** 资金账户余额（后端按流水重算） */
export async function accountBalance(request: APIRequestContext, accountId: string): Promise<string> {
  const result = await apiGet<{ items: { id: string; currentBalance: string }[] }>(
    request,
    '/treasury/accounts',
    { page: 1, size: 500 },
  )
  const account = result.data.items.find((item) => item.id === accountId)
  if (account === undefined) {
    throw new Error(`资金账户不存在：${accountId}`)
  }
  return account.currentBalance
}

/** 应收单详情（含派生已收/未收） */
export async function receivable(
  request: APIRequestContext,
  id: string,
): Promise<{ outstandingAmount: string; paidAmount: string; paymentStatus: string }> {
  const result = await apiGet<{ outstandingAmount: string; paidAmount: string; paymentStatus: string }>(
    request,
    `/receivable/receivables/${id}`,
  )
  return result.data
}

/** 应付单详情（含派生已付/未付） */
export async function payable(
  request: APIRequestContext,
  id: string,
): Promise<{ outstandingAmount: string; paidAmount: string; paymentStatus: string }> {
  const result = await apiGet<{ outstandingAmount: string; paidAmount: string; paymentStatus: string }>(
    request,
    `/payable/payables/${id}`,
  )
  return result.data
}
