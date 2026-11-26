import axios, { AxiosError, type AxiosInstance } from 'axios'

import type { ApiResponse, PageResult } from '@/types/api'

/** API 业务错误：携带统一错误码、消息与 Trace ID */
export class ApiClientError extends Error {
  readonly code: string
  readonly traceId: string
  readonly httpStatus: number

  constructor(message: string, code: string, traceId: string, httpStatus: number) {
    super(message)
    this.name = 'ApiClientError'
    this.code = code
    this.traceId = traceId
    this.httpStatus = httpStatus
  }
}

const baseURL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'

/** 统一 API 客户端：所有请求经 /api/v1 前缀，响应统一解包为 ApiResponse */
export const http: AxiosInstance = axios.create({
  baseURL,
  timeout: 15_000,
})

http.interceptors.response.use(
  (response) => {
    const payload = response.data as ApiResponse<unknown>
    if (payload && typeof payload === 'object' && 'code' in payload) {
      if (payload.code === 'SUCCESS') {
        return { ...response, data: payload.data }
      }
      throw new ApiClientError(payload.message, payload.code, payload.traceId, response.status)
    }
    return response
  },
  (error: AxiosError<ApiResponse<unknown>>) => {
    const payload = error.response?.data
    const traceId = payload?.traceId ?? String(error.response?.headers?.['x-trace-id'] ?? '')
    const code = payload?.code ?? 'NETWORK_ERROR'
    const message = payload?.message ?? '网络请求失败，请稍后重试'
    throw new ApiClientError(message, code, traceId, error.response?.status ?? 0)
  },
)

/** 类型化 GET */
export async function get<T>(url: string, params?: Record<string, string | number>): Promise<T> {
  const response = await http.get<unknown>(url, { params })
  return response.data as T
}

export type { PageResult }
