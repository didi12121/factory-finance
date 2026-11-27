/**
 * Prototype Contract V1 — 统一业务错误契约（不实现业务逻辑）。
 *
 * 与后端统一响应模型对齐（docs/API_CONTRACT.md 第 2/3 节）：
 * 业务异常由后端 `BusinessException` 抛出并转换为对应 HTTP 状态与错误码；
 * 前端契约层以 `BusinessError` 承载失败结果（校验失败、状态冲突等）。
 */

/**
 * 业务错误码（与后端 ErrorCode / HTTP 状态语义一致，禁止统一返回 200）：
 * - BAD_REQUEST：请求参数格式错误（400）
 * - VALIDATION_ERROR：参数/业务规则校验失败（400，字段级错误放 fieldErrors）
 * - UNAUTHORIZED：未认证或凭证无效（401）
 * - FORBIDDEN：无权访问（403）
 * - NOT_FOUND：资源不存在（404）
 * - METHOD_NOT_ALLOWED：请求方法不支持（405）
 * - CONFLICT：业务状态冲突（409，如重复单据编号、幂等键冲突）
 * - INTERNAL_ERROR：服务端内部错误（500）
 */
export type BusinessErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'METHOD_NOT_ALLOWED'
  | 'CONFLICT'
  | 'INTERNAL_ERROR'

/** 业务错误（校验失败、状态冲突等失败结果的统一载体） */
export interface BusinessError {
  /** 错误码（与后端 ErrorCode 对齐） */
  code: BusinessErrorCode
  /** 面向用户的中文说明 */
  message: string
  /** 字段级错误（表单定位用，键为字段名）；无字段级明细时缺省 */
  fieldErrors?: Record<string, string>
}
