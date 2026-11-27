import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ApiClientError,
  apiErrorMessage,
  apiClient,
  clearUnauthorizedHandlers,
  fieldErrorOf,
  get,
  getAuthToken,
  onUnauthorized,
  post,
  setAuthToken,
} from './client'
import { fail, installMockAdapter, ok, type CapturedRequest } from './testAdapter'

describe('API 客户端（ApiResponse 解包/错误/401/失败禁止回退）', () => {
  let restore: () => void

  beforeEach(() => {
    setAuthToken(null)
    clearUnauthorizedHandlers()
  })

  afterEach(() => {
    restore?.()
    setAuthToken(null)
    clearUnauthorizedHandlers()
  })

  it('SUCCESS 响应解包为 data', async () => {
    const mock = installMockAdapter(() => ok({ id: '1', name: '测试' }))
    restore = mock.restore
    const result = await get<{ id: string; name: string }>('/masterdata/customers')
    expect(result).toEqual({ id: '1', name: '测试' })
    expect(mock.requests[0]?.method).toBe('GET')
    expect(mock.requests[0]?.url).toBe('/masterdata/customers')
  })

  it('注入 Bearer 令牌（Authorization: Bearer <token>）', async () => {
    const mock = installMockAdapter(() => ok(null))
    restore = mock.restore
    setAuthToken('token-abc')
    expect(getAuthToken()).toBe('token-abc')
    await get('/treasury/transactions')
    const headers = mock.requests[0]?.headers as Record<string, unknown>
    expect(headers.Authorization).toBe('Bearer token-abc')
  })

  it('未登录请求不携带 Authorization', async () => {
    const mock = installMockAdapter(() => ok(null))
    restore = mock.restore
    await get('/treasury/transactions')
    const headers = mock.requests[0]?.headers as Record<string, unknown>
    expect(headers.Authorization).toBeUndefined()
  })

  it('业务失败（非 SUCCESS）抛 ApiClientError，携带 code/message/traceId', async () => {
    const mock = installMockAdapter(() => fail(409, 'CONFLICT', '单据编号重复'))
    restore = mock.restore
    await expect(post('/treasury/contributions', {})).rejects.toMatchObject({
      name: 'ApiClientError',
      code: 'CONFLICT',
      message: '单据编号重复',
      httpStatus: 409,
      traceId: 'trace-test',
    })
  })

  it('VALIDATION_ERROR 解析 data.fieldErrors 供表单字段展示', async () => {
    const mock = installMockAdapter(() =>
      fail(400, 'VALIDATION_ERROR', '参数校验失败', { amount: '金额必须大于 0' }),
    )
    restore = mock.restore
    const error = await post('/treasury/expenses', {}).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiClientError)
    const apiError = error as ApiClientError
    expect(apiError.fieldErrors).toEqual({ amount: '金额必须大于 0' })
    expect(fieldErrorOf(error, 'amount')).toBe('金额必须大于 0')
    expect(fieldErrorOf(error, 'other')).toBeUndefined()
  })

  it('401 触发统一处理器（登出跳登录装配点）', async () => {
    const mock = installMockAdapter(() => fail(401, 'UNAUTHORIZED', '未认证或凭证无效'))
    restore = mock.restore
    const handler = vi.fn()
    onUnauthorized(handler)
    await expect(get('/treasury/transactions')).rejects.toBeInstanceOf(ApiClientError)
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0]?.[0]).toBeInstanceOf(ApiClientError)
  })

  it('非 401 错误不触发 401 处理器', async () => {
    const mock = installMockAdapter(() => fail(500, 'INTERNAL_ERROR', '服务器内部错误'))
    restore = mock.restore
    const handler = vi.fn()
    onUnauthorized(handler)
    await expect(get('/treasury/transactions')).rejects.toBeInstanceOf(ApiClientError)
    expect(handler).not.toHaveBeenCalled()
  })

  it('网络失败上抛 NETWORK_ERROR，禁止回退 Mock 数据', async () => {
    const originalAdapter = apiClient.defaults.adapter
    restore = () => {
      apiClient.defaults.adapter = originalAdapter
    }
    apiClient.defaults.adapter = () => Promise.reject(new Error('network down'))
    const error = await get('/treasury/transactions').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiClientError)
    expect((error as ApiClientError).code).toBe('NETWORK_ERROR')
    // 失败必须是异常上抛（无任何数据回退）
    expect((error as ApiClientError).httpStatus).toBe(0)
  })

  it('apiErrorMessage 提供可展示消息', () => {
    expect(apiErrorMessage(new ApiClientError('账户已停用', 'CONFLICT', 't', 409), '兜底')).toBe('账户已停用')
    expect(apiErrorMessage(new Error('other'), '兜底文案')).toBe('兜底文案')
    expect(apiErrorMessage(null, '兜底文案')).toBe('兜底文案')
  })
})

describe('API 客户端查询参数装配', () => {
  afterEach(() => {
    // 无共享状态
  })

  it('treasury 查询参数省略空筛选', async () => {
    const { transactionQueryParams, recordQueryParams } = await import('./treasury')
    expect(transactionQueryParams({ page: 1, size: 20 })).toEqual({ page: 1, size: 20 })
    expect(
      transactionQueryParams({
        page: 2,
        size: 50,
        keyword: ' FT- ',
        from: '2026-11-01',
        to: '2026-11-30',
        accountId: 'acct-1',
        transactionType: 'SALARY',
        direction: 'OUT',
      }),
    ).toEqual({
      page: 2,
      size: 50,
      keyword: 'FT-',
      from: '2026-11-01',
      to: '2026-11-30',
      accountId: 'acct-1',
      transactionType: 'SALARY',
      direction: 'OUT',
    })
    expect(recordQueryParams({ page: 1, size: 20, keyword: ' ', status: 'VOIDED' })).toEqual({
      page: 1,
      size: 20,
      status: 'VOIDED',
    })
  })

  it('masterdata 查询参数省略空关键字/未选状态', async () => {
    const { masterdataQueryParams } = await import('./masterdata')
    expect(masterdataQueryParams({ page: 1, size: 20, keyword: '', status: 'ENABLED' })).toEqual({
      page: 1,
      size: 20,
      status: 'ENABLED',
    })
    expect(masterdataQueryParams({ page: 1, size: 20 })).toEqual({ page: 1, size: 20 })
  })
})

// 类型引用（编译期保证捕获请求形状）
export type { CapturedRequest }
