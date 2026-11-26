/** 财务金额的十进制字符串类型，禁止使用 Number 承载 */
export type DecimalString = string

/** 统一 API 成功/失败响应模型（与后端 ApiResponse 对齐） */
export interface ApiResponse<T> {
  code: string
  message: string
  data: T
  traceId: string
}

/** 统一分页响应模型 */
export interface PageResult<T> {
  items: T[]
  total: number
  page: number
  size: number
}

/** 分页查询参数 */
export interface PageQuery {
  page: number
  size: number
}
