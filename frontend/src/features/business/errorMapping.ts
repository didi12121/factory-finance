/**
 * 真实 API 错误 → 页面业务错误契约映射（ApiClientError → BusinessError[]）。
 *
 * 页面层（原型期）以 `BusinessError[]` 展示 message/fieldErrors；
 * 接入真实后端后由本模块统一转换，避免各页面重复实现错误解析。
 */

import { ApiClientError } from '@/services/api'
import type { BusinessError, BusinessErrorCode } from '@/features/prototype/contracts'

const KNOWN_CODES: BusinessErrorCode[] = [
  'BAD_REQUEST',
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'METHOD_NOT_ALLOWED',
  'CONFLICT',
  'INTERNAL_ERROR',
]

function toCode(code: string): BusinessErrorCode {
  return (KNOWN_CODES as string[]).includes(code) ? (code as BusinessErrorCode) : 'INTERNAL_ERROR'
}

/** 把后端/网络错误转换为页面可展示的业务错误列表 */
export function toBusinessErrors(error: unknown, fallback = '操作失败，请稍后重试'): BusinessError[] {
  if (error instanceof ApiClientError) {
    const fieldErrors = error.fieldErrors
    const hasFields = Object.keys(fieldErrors).length > 0
    return [
      {
        code: toCode(error.code),
        message: error.message === '' ? fallback : error.message,
        ...(hasFields ? { fieldErrors } : {}),
      },
    ]
  }
  return [{ code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : fallback }]
}
