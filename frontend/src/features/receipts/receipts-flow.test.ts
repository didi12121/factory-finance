/**
 * 登记回款核心流程测试（组件 + Store 集成，真实数值断言）：
 * 单笔单张 / 单笔多张关键场景 / 多次回款 / 自动分配优先级 / 手动分配 /
 * 精确金额（含 0.01）/ 重复确认幂等 / 防重复点击 / resetDemoData 可重复。
 */
import { describe, expect, it, vi } from 'vitest'

import ConfirmDialog from '@/components/shared/ConfirmDialog.vue'
import {
  chooseCustomer,
  clickTestId,
  confirmViaDialog,
  inputValue,
  mountPage,
  openRegistration,
  settle,
  setInput,
  summaryText,
} from './receiptsTestHarness'
import { compareAmounts, subtractAmounts } from '@/utils/decimal'

describe('登记回款核心流程', () => {
  it('单笔单张：8,000.00 核销 ar-001，收款单/流水/核销各 +1，ar-001 结清', async () => {
    const { wrapper, store } = await mountPage()
    await openRegistration(wrapper)
    await chooseCustomer(wrapper, 'cust-a')
    await setInput(wrapper, '#allocation-input-ar-001', '8000')
    await setInput(wrapper, '#actual-amount', '8000')

    expect(summaryText(wrapper, 'summary-allocated')).toBe('8,000.00')
    expect(summaryText(wrapper, 'summary-unallocated')).toBe('0.00')

    await confirmViaDialog(wrapper)

    expect(store.receipts).toHaveLength(9)
    expect(store.fundTransactions).toHaveLength(23)
    expect(store.receiptAllocations).toHaveLength(11)

    const receipt = store.receipts.find((item) => item.receiptNo === 'SK-2026-0009')
    expect(receipt).toBeDefined()
    expect(receipt?.actualAmount).toBe('8000.00')
    expect(receipt?.fundTransactionId).toBeDefined()

    // 一笔收款只产生一条资金流入
    const inflows = store.fundTransactions.filter((item) => item.sourceDocId === receipt?.id)
    expect(inflows).toHaveLength(1)
    expect(inflows[0]?.direction).toBe('IN')
    expect(inflows[0]?.amount).toBe('8000.00')

    const ar1 = store.receivableViewById('ar-001')
    expect(ar1?.summary.status).toBe('SETTLED')
    expect(ar1?.summary.outstandingAmount).toBe('0.00')
    const ar2 = store.receivableViewById('ar-002')
    expect(ar2?.summary.status).toBe('UNPAID')

    // 成功结果：收款单/流水/核销计数
    expect(wrapper.find('[data-testid="result-receipt-no"]').text()).toContain('SK-2026-0009')
    expect(wrapper.find('[data-testid="result-transaction-no"]').text()).toContain('FT-2026-0023')
    expect(wrapper.find('[data-testid="result-allocation-count"]').text()).toBe('1 笔')
  })

  it('单笔多张（关键场景）：15,000.00 = 8,000 + 7,000，全链路数值正确', async () => {
    const { wrapper, store } = await mountPage()
    const balanceBefore = store.totalFundBalance
    const outstandingBefore = store.dashboardSummary.totalReceivableOutstanding
    const incomeBefore = store.dashboardSummary.periodProcessingFeeIncome

    await openRegistration(wrapper)
    await chooseCustomer(wrapper, 'cust-a')
    await setInput(wrapper, '#actual-amount', '15000')
    await clickTestId(wrapper, 'auto-allocate')

    // 自动分配预览写入行输入（仅预览，不落状态）
    expect(inputValue(wrapper, '#allocation-input-ar-001')).toBe('8000.00')
    expect(inputValue(wrapper, '#allocation-input-ar-002')).toBe('7000.00')
    expect(summaryText(wrapper, 'summary-allocated')).toBe('15,000.00')
    expect(summaryText(wrapper, 'summary-unallocated')).toBe('0.00')
    expect(store.receipts).toHaveLength(8)
    expect(store.receiptAllocations).toHaveLength(10)

    await confirmViaDialog(wrapper)

    // 收款单 +1、资金流入 +1、核销 +2
    expect(store.receipts).toHaveLength(9)
    expect(store.fundTransactions).toHaveLength(23)
    expect(store.receiptAllocations).toHaveLength(12)

    const receipt = store.receipts.find((item) => item.receiptNo === 'SK-2026-0009')
    expect(receipt?.actualAmount).toBe('15000.00')
    const inflows = store.fundTransactions.filter((item) => item.sourceDocId === receipt?.id)
    expect(inflows).toHaveLength(1)
    expect(inflows[0]?.amount).toBe('15000.00')
    const allocs = store.receiptAllocations.filter((item) => item.receiptId === receipt?.id)
    expect(allocs).toHaveLength(2)

    // A 已结清、B 未收 5,000.00
    const ar1 = store.receivableViewById('ar-001')
    expect(ar1?.summary.status).toBe('SETTLED')
    expect(ar1?.summary.outstandingAmount).toBe('0.00')
    const ar2 = store.receivableViewById('ar-002')
    expect(ar2?.summary.status).toBe('PARTIALLY_PAID')
    expect(ar2?.summary.outstandingAmount).toBe('5000.00')

    // 资金余额 +15,000.00、应收余额 −15,000.00、加工收入 +0.00
    expect(compareAmounts(subtractAmounts(store.totalFundBalance, balanceBefore), '15000.00')).toBe(0)
    expect(
      compareAmounts(subtractAmounts(outstandingBefore, store.dashboardSummary.totalReceivableOutstanding), '15000.00'),
    ).toBe(0)
    expect(store.dashboardSummary.periodProcessingFeeIncome).toBe(incomeBefore)

    // 成功结果：核销 2 笔
    expect(wrapper.find('[data-testid="result-allocation-count"]').text()).toBe('2 笔')
  })

  it('resetDemoData 后关键场景可重复', async () => {
    const { wrapper, store } = await mountPage()
    await openRegistration(wrapper)
    await chooseCustomer(wrapper, 'cust-a')
    await setInput(wrapper, '#actual-amount', '15000')
    await clickTestId(wrapper, 'auto-allocate')
    await confirmViaDialog(wrapper)
    expect(store.receipts).toHaveLength(9)

    store.resetDemoData()
    expect(store.receipts).toHaveLength(8)
    expect(store.fundTransactions).toHaveLength(22)
    expect(store.receiptAllocations).toHaveLength(10)
    expect(store.receivableViewById('ar-001')?.summary.status).toBe('UNPAID')
    expect(store.receivableViewById('ar-002')?.summary.status).toBe('UNPAID')

    // 第二遍：同一场景再次确认成功
    await clickTestId(wrapper, 'continue-registration')
    await chooseCustomer(wrapper, 'cust-a')
    await setInput(wrapper, '#actual-amount', '15000')
    await clickTestId(wrapper, 'auto-allocate')
    await confirmViaDialog(wrapper)
    expect(store.receipts).toHaveLength(9)
    expect(store.fundTransactions).toHaveLength(23)
    expect(store.receiptAllocations).toHaveLength(12)
    expect(store.receipts.find((item) => item.receiptNo === 'SK-2026-0009')?.actualAmount).toBe('15000.00')
  })

  it('多次回款：同一应收单分两次回款逐步结清', async () => {
    const { wrapper, store } = await mountPage()
    await openRegistration(wrapper)
    await chooseCustomer(wrapper, 'cust-a')

    // 第一次：3,000.00 核销 ar-002
    await setInput(wrapper, '#allocation-input-ar-002', '3000')
    await setInput(wrapper, '#actual-amount', '3000')
    await confirmViaDialog(wrapper)
    expect(store.receivableViewById('ar-002')?.summary.status).toBe('PARTIALLY_PAID')
    expect(store.receivableViewById('ar-002')?.summary.outstandingAmount).toBe('9000.00')

    // 第二次：9,000.00 核销 ar-002 → 结清
    await clickTestId(wrapper, 'continue-registration')
    await chooseCustomer(wrapper, 'cust-a')
    await setInput(wrapper, '#allocation-input-ar-002', '9000')
    await setInput(wrapper, '#actual-amount', '9000')
    await confirmViaDialog(wrapper)

    expect(store.receipts).toHaveLength(10)
    expect(store.fundTransactions).toHaveLength(24)
    expect(store.receiptAllocations).toHaveLength(12)
    const ar2 = store.receivableViewById('ar-002')
    expect(ar2?.summary.status).toBe('SETTLED')
    expect(ar2?.summary.outstandingAmount).toBe('0.00')
    // ar-001 未受影响
    expect(store.receivableViewById('ar-001')?.summary.status).toBe('UNPAID')
  })

  it('自动分配按到期日优先：客户 B 10,000.00 → ar-004 8,000 + ar-005 2,000', async () => {
    const { wrapper } = await mountPage()
    await openRegistration(wrapper)
    await chooseCustomer(wrapper, 'cust-b')
    await setInput(wrapper, '#actual-amount', '10000')
    await clickTestId(wrapper, 'auto-allocate')

    // 到期日先后：ar-004(2026-11-20) → ar-005(2026-11-30) → ar-018 → ar-021(无到期日)
    expect(inputValue(wrapper, '#allocation-input-ar-004')).toBe('8000.00')
    expect(inputValue(wrapper, '#allocation-input-ar-005')).toBe('2000.00')
    expect(inputValue(wrapper, '#allocation-input-ar-018')).toBe('')
    expect(inputValue(wrapper, '#allocation-input-ar-021')).toBe('')
    expect(summaryText(wrapper, 'summary-allocated')).toBe('10,000.00')
    expect(summaryText(wrapper, 'summary-unallocated')).toBe('0.00')
  })

  it('手动分配、实时汇总与清空分配', async () => {
    const { wrapper, store } = await mountPage()
    await openRegistration(wrapper)
    await chooseCustomer(wrapper, 'cust-a')
    await setInput(wrapper, '#actual-amount', '10000')

    await setInput(wrapper, '#allocation-input-ar-001', '8000')
    expect(summaryText(wrapper, 'summary-allocated')).toBe('8,000.00')
    expect(summaryText(wrapper, 'summary-unallocated')).toBe('2,000.00')

    // 清空分配（含输入残留）
    await clickTestId(wrapper, 'clear-allocations')
    expect(inputValue(wrapper, '#allocation-input-ar-001')).toBe('')
    expect(summaryText(wrapper, 'summary-allocated')).toBe('0.00')

    // 手动分配 ar-002 10,000.00 后确认
    await setInput(wrapper, '#allocation-input-ar-002', '10000')
    await confirmViaDialog(wrapper)
    expect(store.receivableViewById('ar-002')?.summary.paidAmount).toBe('10000.00')
    expect(store.receivableViewById('ar-002')?.summary.outstandingAmount).toBe('2000.00')
  })

  it('精确金额（含 0.01）：客户 C 0.11 = ar-010 0.01 + ar-013 0.10', async () => {
    const { wrapper, store } = await mountPage()
    await openRegistration(wrapper)
    await chooseCustomer(wrapper, 'cust-c')
    await setInput(wrapper, '#allocation-input-ar-010', '0.01')
    await setInput(wrapper, '#allocation-input-ar-013', '0.10')
    await setInput(wrapper, '#actual-amount', '0.11')

    expect(summaryText(wrapper, 'summary-allocated')).toBe('0.11')
    expect(summaryText(wrapper, 'summary-unallocated')).toBe('0.00')

    await confirmViaDialog(wrapper)

    const receipt = store.receipts.find((item) => item.actualAmount === '0.11')
    expect(receipt).toBeDefined()
    const allocs = store.receiptAllocations.filter((item) => item.receiptId === receipt?.id)
    expect(allocs).toHaveLength(2)
    expect(allocs.find((item) => item.receivableId === 'ar-010')?.allocationAmount).toBe('0.01')
    expect(allocs.find((item) => item.receivableId === 'ar-013')?.allocationAmount).toBe('0.10')
    expect(store.receivableViewById('ar-010')?.summary.status).toBe('SETTLED')
    expect(store.receivableViewById('ar-013')?.summary.status).toBe('SETTLED')
  })

  it('重复确认幂等：同键重复提交数量/金额不变；同键不同参拒绝', async () => {
    const { wrapper, store } = await mountPage()
    const spy = vi.spyOn(store, 'confirmReceipt')

    await openRegistration(wrapper)
    await chooseCustomer(wrapper, 'cust-a')
    await setInput(wrapper, '#allocation-input-ar-001', '8000')
    await setInput(wrapper, '#actual-amount', '8000')
    await confirmViaDialog(wrapper)

    expect(spy).toHaveBeenCalledTimes(1)
    const command = spy.mock.calls[0]?.[0]
    expect(command).toBeDefined()
    if (command === undefined) {
      throw new Error('未捕获 confirmReceipt 命令')
    }

    const receiptsAfter = store.receipts.length
    const transactionsAfter = store.fundTransactions.length
    const allocationsAfter = store.receiptAllocations.length
    const firstReceiptId = store.receipts.find((item) => item.idempotencyKey === command.idempotencyKey)?.id

    // 同键同参重复提交：返回原收款单，不产生第二张收款单/流水/重复核销
    const replay = await store.confirmReceipt(command)
    expect(replay.id).toBe(firstReceiptId)
    expect(store.receipts).toHaveLength(receiptsAfter)
    expect(store.fundTransactions).toHaveLength(transactionsAfter)
    expect(store.receiptAllocations).toHaveLength(allocationsAfter)

    // 同键不同参：CONFLICT 拒绝且零变化
    await expect(store.confirmReceipt({ ...command, actualAmount: '999.00' })).rejects.toThrow()
    expect(store.receipts).toHaveLength(receiptsAfter)
    expect(store.fundTransactions).toHaveLength(transactionsAfter)
    expect(store.receiptAllocations).toHaveLength(allocationsAfter)
  })

  it('防重复点击：确认按钮双击仅生成一张收款单', async () => {
    const { wrapper, store } = await mountPage()
    await openRegistration(wrapper)
    await chooseCustomer(wrapper, 'cust-a')
    await setInput(wrapper, '#allocation-input-ar-001', '8000')
    await setInput(wrapper, '#actual-amount', '8000')
    await clickTestId(wrapper, 'confirm-receipt')

    const dialog = wrapper.findComponent(ConfirmDialog)
    expect(dialog.props('open')).toBe(true)
    // 快速两次确认（同一表单会话幂等键）
    dialog.vm.$emit('confirm')
    dialog.vm.$emit('confirm')
    await settle()

    expect(store.receipts).toHaveLength(9)
    expect(store.receiptAllocations.filter((item) => item.receiptId === store.receipts[8]?.id)).toHaveLength(1)
  })
})
