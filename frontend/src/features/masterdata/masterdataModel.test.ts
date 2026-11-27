import { describe, expect, it } from 'vitest'

import {
  emptyMasterdataForm,
  masterdataFormFromRow,
  masterdataFormFromValues,
  toCustomerInput,
  toShareholderInput,
  toggleStatus,
  validateMasterdataForm,
} from './masterdataModel'
import type { Customer, Shareholder } from '@/services/api'

const customer: Customer = {
  id: 'c-1',
  customerNo: 'KH-0001',
  name: '示例名称',
  contact: '李四',
  phone: '13800000000',
  address: null,
  status: 'ENABLED',
  remark: null,
  createdAt: '2026-11-01T09:00:00',
}

const shareholder: Shareholder = {
  id: 's-1',
  shareholderNo: 'GD-0001',
  name: '王五',
  contact: null,
  phone: null,
  status: 'DISABLED',
  remark: '备注',
  createdAt: '2026-11-01T09:00:00',
}

describe('主数据表单校验与载荷装配', () => {
  it('名称必填且限长', () => {
    expect(validateMasterdataForm({ ...emptyMasterdataForm(), name: '' })).toEqual({ name: '请输入名称' })
    expect(validateMasterdataForm({ ...emptyMasterdataForm(), name: 'n'.repeat(129) })).toEqual({
      name: '名称长度不能超过 128',
    })
    expect(validateMasterdataForm({ ...emptyMasterdataForm(), name: '正常名称' })).toEqual({})
  })

  it('载荷装配：编号后端生成（不输出编号字段），空可选字段归一化为 null', () => {
    const form = { name: '  客户A  ', contact: '', phone: ' 138 ', address: ' 地址 ', remark: '', status: 'ENABLED' as const }
    const input = toCustomerInput(form)
    expect(input).toEqual({
      name: '客户A',
      contact: null,
      phone: '138',
      address: '地址',
      remark: null,
      status: 'ENABLED',
    })
    expect('customerNo' in input).toBe(false)

    const shareholderInput = toShareholderInput({ ...form, address: '' })
    expect(shareholderInput).toEqual({
      name: '客户A',
      contact: null,
      phone: '138',
      remark: null,
      status: 'ENABLED',
    })
    expect('shareholderNo' in shareholderInput).toBe(false)
  })

  it('行 → 表单回填（含/不含地址），缺失字段回退空值', () => {
    expect(masterdataFormFromRow(customer, true)).toEqual({
      name: '示例名称',
      contact: '李四',
      phone: '13800000000',
      address: '',
      remark: '',
      status: 'ENABLED',
    })
    // 股东不展示地址字段
    expect(masterdataFormFromRow(shareholder, false).address).toBe('')
    expect(masterdataFormFromRow(shareholder, false).status).toBe('DISABLED')
  })

  it('schema 表单值 → 表单状态（缺失字段按空值/启用处理）', () => {
    expect(masterdataFormFromValues({})).toEqual(emptyMasterdataForm())
    expect(masterdataFormFromValues({ name: 'A', status: 'DISABLED' })).toEqual({
      name: 'A',
      contact: '',
      phone: '',
      address: '',
      remark: '',
      status: 'DISABLED',
    })
  })

  it('启停用切换', () => {
    expect(toggleStatus('ENABLED')).toBe('DISABLED')
    expect(toggleStatus('DISABLED')).toBe('ENABLED')
  })
})
