/**
 * 测试支撑：axios mock 适配器（仅 vitest 使用，不进入生产代码引用图）。
 * 通过 `apiClient.defaults.adapter` 注入，走真实拦截器链（解包/错误/401 处理）。
 */

import { AxiosError, type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'

import { apiClient } from './client'

/** 期望的请求（断言用） */
export interface CapturedRequest {
  method: string
  url: string
  params: Record<string, unknown>
  headers: Record<string, unknown>
  body: unknown
}

export interface MockReply {
  status: number
  data: unknown
}

/**
 * 构造 mock 适配器：handler 决定响应；同时捕获请求供断言。
 * 非 2xx 按 axios 错误语义抛出（触发响应拦截器错误分支）。
 */
export function installMockAdapter(
  handler: (config: InternalAxiosRequestConfig, captured: CapturedRequest) => MockReply,
): { requests: CapturedRequest[]; restore: () => void } {
  const requests: CapturedRequest[] = []
  const originalAdapter = apiClient.defaults.adapter

  const adapter: AxiosAdapter = async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
    const captured: CapturedRequest = {
      method: (config.method ?? 'get').toUpperCase(),
      url: config.url ?? '',
      params: { ...(config.params as Record<string, unknown> | undefined) },
      headers: { ...(config.headers as Record<string, unknown>) },
      body: config.data === undefined ? undefined : JSON.parse(String(config.data)),
    }
    requests.push(captured)
    const reply = handler(config, captured)
    const response: AxiosResponse = {
      data: reply.data,
      status: reply.status,
      statusText: String(reply.status),
      headers: {},
      config,
    }
    if (reply.status >= 200 && reply.status < 300) {
      return response
    }
    throw new AxiosError(
      `Request failed with status code ${reply.status}`,
      String(reply.status),
      config,
      null,
      response,
    )
  }

  apiClient.defaults.adapter = adapter
  return {
    requests,
    restore: () => {
      apiClient.defaults.adapter = originalAdapter
    },
  }
}

/** 成功响应（ApiResponse 包装） */
export function ok<T>(data: T, status = 200): MockReply {
  return { status, data: { code: 'SUCCESS', message: 'success', data, traceId: 'trace-test' } }
}

/** 业务失败响应（ApiResponse 包装） */
export function fail(
  status: number,
  code: string,
  message: string,
  fieldErrors?: Record<string, string>,
): MockReply {
  return {
    status,
    data: {
      code,
      message,
      data: fieldErrors ? { fieldErrors } : null,
      traceId: 'trace-test',
    },
  }
}
