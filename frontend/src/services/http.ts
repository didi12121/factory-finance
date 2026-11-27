/**
 * 兼容出口：统一 API 客户端已收敛到 `services/api/client.ts`（Phase 1）。
 * 本文件仅保留既有导入路径的再导出，公共请求逻辑禁止重复实现。
 */

export { apiClient as http, ApiClientError, get, post, put } from './api/client'
export type { PageResult } from '@/types/api'
