/**
 * 统一 API 客户端（Phase 1 真实后端对接）。
 *
 * 职责：
 * - axios 实例：baseURL `/api/v1`、Bearer 令牌注入、超时；
 * - `ApiResponse` 统一解包（code=SUCCESS → data；否则抛 ApiClientError）；
 * - 401 统一处理：触发 onUnauthorized 注册的处理器（登出 + 跳登录），由
 *   `app/authBridge.ts` 在应用启动时装配（避免 client → store → api 循环依赖）；
 * - 错误 → 可展示消息（`apiErrorMessage` / `fieldErrorOf`）。
 *
 * 红线：
 * - **失败禁止回退 Mock/演示数据**：任何请求失败都以 ApiClientError 上抛，
 *   由页面决定重试或展示错误；
 * - 金额字段一律 DecimalString，禁止 Number 承载财务金额。
 */

import axios, { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios'

import type { ApiResponse } from '@/types/api'

/** API 业务错误：携带统一错误码、可展示消息、字段级校验错误与 Trace ID */
export class ApiClientError extends Error {
  readonly code: string
  readonly traceId: string
  readonly httpStatus: number
  /** VALIDATION_ERROR 的字段级错误（ApiResponse.data.fieldErrors） */
  readonly fieldErrors: Record<string, string>

  constructor(
    message: string,
    code: string,
    traceId: string,
    httpStatus: number,
    fieldErrors: Record<string, string> = {},
  ) {
    super(message)
    this.name = 'ApiClientError'
    this.code = code
    this.traceId = traceId
    this.httpStatus = httpStatus
    this.fieldErrors = fieldErrors
  }
}

/** 查询参数（仅允许可序列化标量） */
export type QueryParams = Record<string, string | number | boolean | undefined>

/* ----------------------------- 令牌注入 ----------------------------- */

let authToken: string | null = null

/** 设置/清除 Bearer 令牌（由 stores/auth.ts 在登录/登出/恢复会话时同步） */
export function setAuthToken(token: string | null): void {
  authToken = token
}

/** 当前 Bearer 令牌（测试与调试用） */
export function getAuthToken(): string | null {
  return authToken
}

/* --------------------------- 401 统一处理 --------------------------- */

export type UnauthorizedHandler = (error: ApiClientError) => void

const unauthorizedHandlers = new Set<UnauthorizedHandler>()

/**
 * 注册 401 处理器（登出 + 跳登录由处理器负责）。
 * @returns 取消注册函数
 */
export function onUnauthorized(handler: UnauthorizedHandler): () => void {
  unauthorizedHandlers.add(handler)
  return () => {
    unauthorizedHandlers.delete(handler)
  }
}

/** 测试用：清空全部 401 处理器 */
export function clearUnauthorizedHandlers(): void {
  unauthorizedHandlers.clear()
}

function notifyUnauthorized(error: ApiClientError): void {
  for (const handler of unauthorizedHandlers) {
    handler(error)
  }
}

/* --------------------------- axios 实例 ---------------------------- */

const baseURL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'

export const apiClient: AxiosInstance = axios.create({
  baseURL,
  timeout: 15_000,
})

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (authToken !== null) {
    config.headers.Authorization = `Bearer ${authToken}`
  }
  return config
})

function extractFieldErrors(payload: unknown): Record<string, string> {
  if (payload !== null && typeof payload === 'object' && 'data' in payload) {
    const data = (payload as { data?: unknown }).data
    if (data !== null && typeof data === 'object' && 'fieldErrors' in data) {
      const fieldErrors = (data as { fieldErrors?: unknown }).fieldErrors
      if (fieldErrors !== null && typeof fieldErrors === 'object') {
        return fieldErrors as Record<string, string>
      }
    }
  }
  return {}
}

apiClient.interceptors.response.use(
  (response) => {
    const payload = response.data as ApiResponse<unknown> | unknown
    if (payload !== null && typeof payload === 'object' && 'code' in payload) {
      const api = payload as ApiResponse<unknown>
      if (api.code === 'SUCCESS') {
        return { ...response, data: api.data }
      }
      throw new ApiClientError(
        api.message,
        api.code,
        api.traceId,
        response.status,
        extractFieldErrors(api),
      )
    }
    // 非 ApiResponse 形态（如静态资源）：原样返回
    return response
  },
  (error: AxiosError<ApiResponse<unknown>>) => {
    const payload = error.response?.data
    const traceId =
      payload?.traceId ?? String(error.response?.headers?.['x-trace-id'] ?? '')
    const code = payload?.code ?? 'NETWORK_ERROR'
    const message = payload?.message ?? '网络请求失败，请稍后重试'
    const apiError = new ApiClientError(
      message,
      code,
      traceId,
      error.response?.status ?? 0,
      extractFieldErrors(payload),
    )
    if (apiError.httpStatus === 401) {
      notifyUnauthorized(apiError)
    }
    throw apiError
  },
)

/* ----------------------------- 请求助手 ----------------------------- */

/** 类型化 GET（响应已解包为 ApiResponse.data） */
export async function get<T>(url: string, params?: QueryParams): Promise<T> {
  const response = await apiClient.get<unknown>(url, { params })
  return response.data as T
}

/** 类型化 POST */
export async function post<T>(url: string, body?: unknown): Promise<T> {
  const response = await apiClient.post<unknown>(url, body)
  return response.data as T
}

/** 类型化 PUT */
export async function put<T>(url: string, body?: unknown): Promise<T> {
  const response = await apiClient.put<unknown>(url, body)
  return response.data as T
}

/**
 * 错误 → 可展示消息（ErrorState/Toast 文案用）。
 * ApiClientError 使用后端 message；其余错误使用 fallback。
 */
export function apiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiClientError && error.message !== '') {
    return error.message
  }
  return fallback
}

/** 取字段级校验错误（VALIDATION_ERROR 的 data.fieldErrors） */
export function fieldErrorOf(error: unknown, field: string): string | undefined {
  if (error instanceof ApiClientError) {
    return error.fieldErrors[field]
  }
  return undefined
}
