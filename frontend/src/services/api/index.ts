/** Phase 1 真实业务 API 统一出口（services/api） */

export {
  ApiClientError,
  apiClient,
  apiErrorMessage,
  clearUnauthorizedHandlers,
  fieldErrorOf,
  get,
  getAuthToken,
  onUnauthorized,
  post,
  put,
  setAuthToken,
  type QueryParams,
  type UnauthorizedHandler,
} from './client'
export * from './types'
export * from './labels'
export * as authApi from './auth'
export * as masterdataApi from './masterdata'
export * as treasuryApi from './treasury'
export * as receivableApi from './receivable'
export * as payableApi from './payable'
export * as importerApi from './importer'
