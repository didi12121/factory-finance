/**
 * 主数据 API：客户 / 股东 / 资金账户（docs/API_CONTRACT.md 第 10 节）。
 * GET 分页 ?page&size&keyword&status、POST、PUT /{id}；业务编号由后端生成。
 */

import { get, post, put } from './client'
import type {
  Customer,
  CustomerInput,
  EnableStatus,
  FundAccount,
  FundAccountInput,
  PageResult,
  Shareholder,
  ShareholderInput,
  Supplier,
  SupplierInput,
} from './types'

/** 主数据列表查询（分页 + 关键字 + 启停用状态） */
export interface MasterdataListQuery {
  page: number
  size: number
  keyword?: string
  status?: EnableStatus
}

/** 通用主数据列表参数序列化（省略空关键字/未选状态） */
export function masterdataQueryParams(query: MasterdataListQuery): Record<string, string | number> {
  const params: Record<string, string | number> = { page: query.page, size: query.size }
  const keyword = query.keyword?.trim()
  if (keyword) {
    params.keyword = keyword
  }
  if (query.status) {
    params.status = query.status
  }
  return params
}

/* -------------------------------- 客户 -------------------------------- */

export function listCustomers(query: MasterdataListQuery): Promise<PageResult<Customer>> {
  return get<PageResult<Customer>>('/masterdata/customers', masterdataQueryParams(query))
}

export function createCustomer(input: CustomerInput): Promise<Customer> {
  return post<Customer>('/masterdata/customers', input)
}

export function updateCustomer(id: string, input: CustomerInput): Promise<Customer> {
  return put<Customer>(`/masterdata/customers/${id}`, input)
}

/* -------------------------------- 股东 -------------------------------- */

export function listShareholders(query: MasterdataListQuery): Promise<PageResult<Shareholder>> {
  return get<PageResult<Shareholder>>('/masterdata/shareholders', masterdataQueryParams(query))
}

export function createShareholder(input: ShareholderInput): Promise<Shareholder> {
  return post<Shareholder>('/masterdata/shareholders', input)
}

export function updateShareholder(id: string, input: ShareholderInput): Promise<Shareholder> {
  return put<Shareholder>(`/masterdata/shareholders/${id}`, input)
}

/* -------------------------------- 供应商 ------------------------------- */

export function listSuppliers(query: MasterdataListQuery): Promise<PageResult<Supplier>> {
  return get<PageResult<Supplier>>('/masterdata/suppliers', masterdataQueryParams(query))
}

export function createSupplier(input: SupplierInput): Promise<Supplier> {
  return post<Supplier>('/masterdata/suppliers', input)
}

export function updateSupplier(id: string, input: SupplierInput): Promise<Supplier> {
  return put<Supplier>(`/masterdata/suppliers/${id}`, input)
}

/* ------------------------------ 资金账户 ------------------------------ */

export function listAccounts(query: MasterdataListQuery): Promise<PageResult<FundAccount>> {
  return get<PageResult<FundAccount>>('/treasury/accounts', masterdataQueryParams(query))
}

export function createAccount(input: FundAccountInput): Promise<FundAccount> {
  return post<FundAccount>('/treasury/accounts', input)
}

export function updateAccount(id: string, input: FundAccountInput): Promise<FundAccount> {
  return put<FundAccount>(`/treasury/accounts/${id}`, input)
}
