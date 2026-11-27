/**
 * 核销校验红线与跨页路由预填测试：
 * - UI 阻断 + Store 最终防线（UI 校验不可替代 Store 校验）：
 *   未分配 > 0 禁止确认 / 超额拒绝 / 非法金额拒绝 / 跨客户拒绝 / 重复分配拒绝 /
 *   累计超过原始应收拒绝 / 无效账户拒绝；失败零变化。
 * - 路由参数（契约 navigation.ts）识别与预填：有效参数预填（不预填金额，不误核销）、
 *   无效参数安全处理。
 */
import { describe, expect, it } from 'vitest'

import {
  chooseCustomer,
  clickTestId,
  expectConfirmDisabled,
  getSelect,
  inputValue,
  mountPage,
  openRegistration,
  setInput,
  summaryText,
} from './receiptsTestHarness'
import { buildConfirmReceiptCommand } from './receiptModel'
import { DEMO_TODAY, type ConfirmReceiptCommand } from '@/features/prototype/contracts'
import type { usePrototypeStore } from '@/features/prototype/stores/prototype'

interface Snapshot {
  receipts: number
  transactions: number
  allocations: number
}

function snapshot(store: ReturnType<typeof usePrototypeStore>): Snapshot {
  return {
    receipts: store.receipts.length,
    transactions: store.fundTransactions.length,
    allocations: store.receiptAllocations.length,
  }
}

function expectUnchanged(actual: Snapshot, before: Snapshot): void {
  expect(actual).toEqual(before)
}

function baseCommand(overrides: Partial<ConfirmReceiptCommand> = {}): ConfirmReceiptCommand {
  return {
    idempotencyKey: 'guard-test-key',
    customerId: 'cust-a',
    receiptDate: DEMO_TODAY,
    accountId: 'acct-bank',
    actualAmount: '8000.00',
    externalRef: null,
    remark: null,
    allocations: [{ receivableId: 'ar-001', allocationAmount: '8000.00' }],
    ...overrides,
  }
}

describe('核销校验红线（UI 阻断 + Store 最终防线）', () => {
  it('未分配 > 0：展示金额与 Phase 2 说明、禁止确认；Store 拒绝且失败零变化', async () => {
    const { wrapper, store } = await mountPage()
    await openRegistration(wrapper)
    await chooseCustomer(wrapper, 'cust-a')
    await setInput(wrapper, '#allocation-input-ar-001', '8000')
    await setInput(wrapper, '#actual-amount', '15000')

    const warning = wrapper.find('[data-testid="unallocated-warning"]')
    expect(warning.exists()).toBe(true)
    expect(warning.text()).toContain('7,000.00')
    expect(warning.text()).toContain('Phase 2')
    expect(warning.text()).toContain('禁止确认收款')
    expectConfirmDisabled(wrapper)

    // Store 最终防线：预收款规则待 Phase 2，未分配 > 0 一律拒绝确认
    const before = snapshot(store)
    const command = buildConfirmReceiptCommand({
      idempotencyKey: 'unallocated-key',
      customerId: 'cust-a',
      receiptDate: DEMO_TODAY,
      accountId: 'acct-bank',
      actualAmount: '15000.00',
      externalRef: '',
      remark: '',
      amounts: { 'ar-001': '8000.00' },
    })
    const errors = await store.validateReceiptAllocation(command)
    expect(errors.some((item) => item.message.includes('未分配金额'))).toBe(true)
    await expect(store.confirmReceipt(command)).rejects.toThrow()
    expectUnchanged(snapshot(store), before)
  })

  it('超额核销：实时错误提示、确认禁用；Store 拒绝', async () => {
    const { wrapper, store } = await mountPage()
    await openRegistration(wrapper)
    await chooseCustomer(wrapper, 'cust-a')
    await setInput(wrapper, '#allocation-input-ar-001', '8000')
    await setInput(wrapper, '#allocation-input-ar-002', '7000')
    await setInput(wrapper, '#actual-amount', '14000')

    const errors = wrapper.find('[data-testid="allocation-errors"]')
    expect(errors.text()).toContain('核销总额超过实际收款金额')
    expectConfirmDisabled(wrapper)

    const before = snapshot(store)
    const command = buildConfirmReceiptCommand({
      idempotencyKey: 'over-key',
      customerId: 'cust-a',
      receiptDate: DEMO_TODAY,
      accountId: 'acct-bank',
      actualAmount: '14000.00',
      externalRef: '',
      remark: '',
      amounts: { 'ar-001': '8000.00', 'ar-002': '7000.00' },
    })
    const validation = await store.validateReceiptAllocation(command)
    expect(validation.some((item) => item.message.includes('核销总额超过实际收款金额'))).toBe(true)
    await expect(store.confirmReceipt(command)).rejects.toThrow()
    expectUnchanged(snapshot(store), before)
  })

  it('非法金额：AmountInput 阻断提交；Store 拒绝非法/非正金额', async () => {
    const { wrapper, store } = await mountPage()
    await openRegistration(wrapper)
    await chooseCustomer(wrapper, 'cust-a')
    await setInput(wrapper, '#actual-amount', '8000')
    await setInput(wrapper, '#allocation-input-ar-001', '1.234')

    // 非法金额立即展示错误且阻断确认（禁止提交旧金额/非法金额）
    expect(wrapper.text()).toContain('金额格式不正确')
    expect(inputValue(wrapper, '#allocation-input-ar-001')).toBe('1.234')
    expectConfirmDisabled(wrapper)

    const before = snapshot(store)
    // 核销金额格式非法
    const invalidDraft = buildConfirmReceiptCommand({
      idempotencyKey: 'invalid-key',
      customerId: 'cust-a',
      receiptDate: DEMO_TODAY,
      accountId: 'acct-bank',
      actualAmount: '8000.00',
      externalRef: '',
      remark: '',
      amounts: { 'ar-001': '1.234' },
    })
    const errors = await store.validateReceiptAllocation(invalidDraft)
    expect(errors.some((item) => item.message.includes('核销金额格式非法'))).toBe(true)
    await expect(store.confirmReceipt(invalidDraft)).rejects.toThrow()

    // 非正金额（0）拒绝
    const zeroDraft = baseCommand({
      idempotencyKey: 'zero-key',
      actualAmount: '0.00',
      allocations: [{ receivableId: 'ar-001', allocationAmount: '0' }],
    })
    const zeroErrors = await store.validateReceiptAllocation(zeroDraft)
    expect(zeroErrors.some((item) => item.message.includes('实际收款金额必须大于 0'))).toBe(true)
    expect(zeroErrors.some((item) => item.message.includes('核销金额必须大于 0'))).toBe(true)
    await expect(store.confirmReceipt(zeroDraft)).rejects.toThrow()

    expectUnchanged(snapshot(store), before)
  })

  it('跨客户核销拒绝（失败零变化）', async () => {
    const { store } = await mountPage()
    const before = snapshot(store)
    // cust-a 的收款单核销 cust-b 的应收单 ar-004
    const command = baseCommand({
      idempotencyKey: 'cross-customer-key',
      allocations: [{ receivableId: 'ar-004', allocationAmount: '100.00' }],
    })
    const errors = await store.validateReceiptAllocation(command)
    expect(errors.some((item) => item.message.includes('不允许跨客户核销'))).toBe(true)
    await expect(store.confirmReceipt(command)).rejects.toThrow()
    expectUnchanged(snapshot(store), before)
  })

  it('重复分配拒绝（同一应收单重复核销）', async () => {
    const { store } = await mountPage()
    const before = snapshot(store)
    const command = baseCommand({
      idempotencyKey: 'duplicate-key',
      allocations: [
        { receivableId: 'ar-001', allocationAmount: '4000.00' },
        { receivableId: 'ar-001', allocationAmount: '4000.00' },
      ],
    })
    const errors = await store.validateReceiptAllocation(command)
    expect(errors.some((item) => item.message.includes('重复'))).toBe(true)
    await expect(store.confirmReceipt(command)).rejects.toThrow()
    expectUnchanged(snapshot(store), before)
  })

  it('累计核销超过原始应收拒绝（ar-001 原始 8,000.00 核销 8,000.01）', async () => {
    const { store } = await mountPage()
    const before = snapshot(store)
    const command = baseCommand({
      idempotencyKey: 'over-original-key',
      actualAmount: '8000.01',
      allocations: [{ receivableId: 'ar-001', allocationAmount: '8000.01' }],
    })
    const errors = await store.validateReceiptAllocation(command)
    expect(errors.some((item) => item.message.includes('累计核销金额超过应收单原始金额'))).toBe(true)
    await expect(store.confirmReceipt(command)).rejects.toThrow()
    expectUnchanged(snapshot(store), before)
  })

  it('无效账户拒绝：停用账户与不存在账户', async () => {
    const { store } = await mountPage()
    const before = snapshot(store)

    const disabledAccount = baseCommand({ idempotencyKey: 'acct-disabled', accountId: 'acct-alipay' })
    const disabledErrors = await store.validateReceiptAllocation(disabledAccount)
    expect(disabledErrors.some((item) => item.message.includes('资金账户已停用'))).toBe(true)
    await expect(store.confirmReceipt(disabledAccount)).rejects.toThrow()

    const missingAccount = baseCommand({ idempotencyKey: 'acct-missing', accountId: 'acct-x' })
    const missingErrors = await store.validateReceiptAllocation(missingAccount)
    expect(missingErrors.some((item) => item.message.includes('资金账户不存在'))).toBe(true)
    await expect(store.confirmReceipt(missingAccount)).rejects.toThrow()

    expectUnchanged(snapshot(store), before)
  })
})

describe('跨页路由参数预填（组件级）', () => {
  it('action=create 且参数有效：预填客户与目标应收单，且不预填任何核销金额', async () => {
    const { wrapper } = await mountPage(
      '/business/processing-fee?action=create&customerId=cust-a&receivableId=ar-002',
    )

    // 登记表单自动展开（唯一回款登记入口）
    expect(wrapper.find('#receipt-registration').exists()).toBe(true)
    // 客户预填（Select 契约值）
    expect(getSelect(wrapper, 'registration-customer').props('modelValue')).toBe('cust-a')
    // 核销分配表加载该客户未结清应收单
    expect(wrapper.find('[data-testid="allocation-row-ar-001"]').exists()).toBe(true)
    const target = wrapper.find('[data-testid="allocation-row-ar-002"]')
    expect(target.exists()).toBe(true)
    expect(target.classes()).toContain('bg-brand-subtle')
    // 不预填任何核销金额（不误核销）
    expect(inputValue(wrapper, '#allocation-input-ar-001')).toBe('')
    expect(inputValue(wrapper, '#allocation-input-ar-002')).toBe('')
    // 参数有效：无提示
    expect(wrapper.find('[data-testid="route-notice"]').exists()).toBe(false)
  })

  it('无效 receivableId：提示并安全处理（客户仍预填，不误核销）', async () => {
    const { wrapper } = await mountPage(
      '/business/processing-fee?action=create&customerId=cust-a&receivableId=ar-999',
    )
    const notice = wrapper.find('[data-testid="route-notice"]')
    expect(notice.exists()).toBe(true)
    expect(notice.text()).toContain('应收单不存在')
    expect(getSelect(wrapper, 'registration-customer').props('modelValue')).toBe('cust-a')
    expect(wrapper.find('#allocation-input-ar-001').exists()).toBe(true)
    expect(inputValue(wrapper, '#allocation-input-ar-001')).toBe('')
  })

  it('应收单跨客户参数：提示并忽略，核销行只含所选客户', async () => {
    const { wrapper } = await mountPage(
      '/business/processing-fee?action=create&customerId=cust-b&receivableId=ar-001',
    )
    const notice = wrapper.find('[data-testid="route-notice"]')
    expect(notice.text()).toContain('不属于所选客户')
    // 核销行仅来自 cust-b（不误核销 ar-001）
    expect(wrapper.find('[data-testid="allocation-row-ar-001"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="allocation-row-ar-004"]').exists()).toBe(true)
  })

  it('停用客户参数（示例客户 E）：提示并忽略预填', async () => {
    const { wrapper } = await mountPage(
      '/business/processing-fee?action=create&customerId=cust-e&receivableId=ar-024',
    )
    const notice = wrapper.find('[data-testid="route-notice"]')
    expect(notice.text()).toContain('已停用')
    expect(getSelect(wrapper, 'registration-customer').props('modelValue')).toBe('')
  })

  it('action 非 create：不展开登记表单并提示', async () => {
    const { wrapper } = await mountPage('/business/processing-fee?action=delete&customerId=cust-a')
    expect(wrapper.find('#receipt-registration').exists()).toBe(false)
    expect(wrapper.find('[data-testid="route-notice"]').text()).toContain('action')
  })

  it('未携带 action 但携带 customerId：忽略预填并提示', async () => {
    const { wrapper } = await mountPage('/business/processing-fee?customerId=cust-a')
    expect(wrapper.find('#receipt-registration').exists()).toBe(false)
    expect(wrapper.find('[data-testid="route-notice"]').exists()).toBe(true)
    // 手动展开登记表单后不带任何预填（参数已被忽略）
    await openRegistration(wrapper)
    expect(getSelect(wrapper, 'registration-customer').props('modelValue')).toBe('')
    expect(wrapper.find('#allocation-input-ar-001').exists()).toBe(false)
  })

  it('汇总展示实时金额（实际收款/已分配/未分配）', async () => {
    const { wrapper } = await mountPage()
    await openRegistration(wrapper)
    await chooseCustomer(wrapper, 'cust-a')
    await setInput(wrapper, '#actual-amount', '15000')
    await setInput(wrapper, '#allocation-input-ar-001', '8000')

    expect(summaryText(wrapper, 'summary-actual')).toBe('15,000.00')
    expect(summaryText(wrapper, 'summary-allocated')).toBe('8,000.00')
    expect(summaryText(wrapper, 'summary-unallocated')).toBe('7,000.00')
    await clickTestId(wrapper, 'clear-allocations')
    expect(summaryText(wrapper, 'summary-allocated')).toBe('0.00')
    expect(summaryText(wrapper, 'summary-unallocated')).toBe('15,000.00')
  })
})
