/**
 * 原型业务错误包装（Repository/Store 写操作的 Promise 拒绝载体）。
 *
 * 契约语义：`PrototypeRepository` 的写方法返回 `Promise<实体>`；
 * 校验失败时以本错误拒绝，携带 `BusinessError[]`（与 errors.ts 契约一致），
 * 保证「失败操作零状态变化」且页面层可直接展示 message / fieldErrors。
 */

import type { BusinessError } from '../contracts'

/** 写操作校验失败错误（携带统一 BusinessError 列表） */
export class PrototypeBusinessError extends Error {
  /** 全部业务错误（按发现顺序） */
  readonly errors: BusinessError[]

  constructor(errors: BusinessError[]) {
    super(errors.map((item) => item.message).join('；'))
    this.name = 'PrototypeBusinessError'
    this.errors = errors
  }

  /** 首要业务错误（无错误时为 null） */
  get primary(): BusinessError | null {
    return this.errors.length > 0 ? this.errors[0] : null
  }
}

/** 类型守卫：判断未知值是否为 PrototypeBusinessError */
export function isPrototypeBusinessError(value: unknown): value is PrototypeBusinessError {
  return value instanceof PrototypeBusinessError
}
