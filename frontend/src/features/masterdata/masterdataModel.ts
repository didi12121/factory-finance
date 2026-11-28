/**
 * 主数据页面视图模型（客户/股东，纯函数）：表单状态与校验、启停用载荷装配。
 * 后端校验为最终防线；编号由后端生成，前端禁止生成/修改业务编号。
 */

import type {
  Customer,
  CustomerInput,
  EnableStatus,
  Shareholder,
  ShareholderInput,
  Supplier,
  SupplierInput,
} from '@/services/api'

/** 启停用筛选值（Select） */
export const STATUS_FILTER_ALL = 'ALL' as const
export type StatusFilter = EnableStatus | typeof STATUS_FILTER_ALL

/** 主数据表单状态（客户含地址；股东不展示地址字段；type 别名保证与 schema 值映射兼容） */
export type MasterdataFormState = {
  name: string
  contact: string
  phone: string
  address: string
  remark: string
  status: EnableStatus
}

export function emptyMasterdataForm(): MasterdataFormState {
  return { name: '', contact: '', phone: '', address: '', remark: '', status: 'ENABLED' }
}

/** schema 表单值（Record）→ 表单状态（缺失字段按空值/启用处理） */
export function masterdataFormFromValues(values: Record<string, string>): MasterdataFormState {
  return {
    name: values.name ?? '',
    contact: values.contact ?? '',
    phone: values.phone ?? '',
    address: values.address ?? '',
    remark: values.remark ?? '',
    status: values.status === 'DISABLED' ? 'DISABLED' : 'ENABLED',
  }
}

/** 由行数据装配编辑表单 */
export function masterdataFormFromRow(
  row: Customer | Shareholder | Supplier,
  withAddress: boolean,
): MasterdataFormState {
  const address = withAddress && 'address' in row ? (row.address ?? '') : ''
  return {
    name: row.name,
    contact: row.contact ?? '',
    phone: row.phone ?? '',
    address,
    remark: row.remark ?? '',
    status: row.status,
  }
}

/**
 * 表单语义校验：名称必填（≤ 128），电话格式宽松校验（≤ 32）。
 * @returns 字段级错误（全部为空即通过）
 */
export function validateMasterdataForm(form: MasterdataFormState): Record<string, string> {
  const errors: Record<string, string> = {}
  if (form.name.trim() === '') {
    errors.name = '请输入名称'
  } else if (form.name.trim().length > 128) {
    errors.name = '名称长度不能超过 128'
  }
  if (form.contact.trim().length > 64) {
    errors.contact = '联系人长度不能超过 64'
  }
  if (form.phone.trim().length > 32) {
    errors.phone = '电话长度不能超过 32'
  }
  return errors
}

/** 表单 → 客户载荷（编号后端生成；空可选字段以 null 传输） */
export function toCustomerInput(form: MasterdataFormState): CustomerInput {
  return {
    name: form.name.trim(),
    contact: form.contact.trim() === '' ? null : form.contact.trim(),
    phone: form.phone.trim() === '' ? null : form.phone.trim(),
    address: form.address.trim() === '' ? null : form.address.trim(),
    remark: form.remark.trim() === '' ? null : form.remark.trim(),
    status: form.status,
  }
}

/** 表单 → 供应商载荷（编号后端生成 SUP-0001 递增） */
export function toSupplierInput(form: MasterdataFormState): SupplierInput {
  return {
    name: form.name.trim(),
    contact: form.contact.trim() === '' ? null : form.contact.trim(),
    phone: form.phone.trim() === '' ? null : form.phone.trim(),
    remark: form.remark.trim() === '' ? null : form.remark.trim(),
    status: form.status,
  }
}

/** 表单 → 股东载荷 */
export function toShareholderInput(form: MasterdataFormState): ShareholderInput {
  return {
    name: form.name.trim(),
    contact: form.contact.trim() === '' ? null : form.contact.trim(),
    phone: form.phone.trim() === '' ? null : form.phone.trim(),
    remark: form.remark.trim() === '' ? null : form.remark.trim(),
    status: form.status,
  }
}

/** 启停用切换载荷（PUT 全量更新：保留原字段，仅切换状态） */
export function toggleStatus(status: EnableStatus): EnableStatus {
  return status === 'ENABLED' ? 'DISABLED' : 'ENABLED'
}
