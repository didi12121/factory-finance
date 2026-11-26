import { get } from '@/services/http'

export interface HealthPayload {
  status: string
  service: string
  time: string
}

/** 健康检查：本阶段唯一开放的业务 API */
export function fetchHealth(): Promise<HealthPayload> {
  return get<HealthPayload>('/health')
}
