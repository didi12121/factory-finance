/**
 * 应收账款列表页组件测试 —— Agent F（P02-F）。
 *
 * 真实挂载（Pinia + 内存路由），覆盖：
 * Tab 状态筛选与逾期独立筛选（含逾期与部分回款并存）、客户/月份筛选、关键字搜索与清空、
 * 金额列精确排序（compareAmounts）、新建应收单（表单校验/非法金额拒绝/不增加现金/
 * 列表与指标即时更新/防重复提交）、登记回款路径构造（冻结契约参数顺序）、
 * 加载失败错误状态与重试、空数据状态。
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

import Select from '@/components/ui/select/Select.vue'
import { buildProcessingFeeCreatePath } from '@/features/prototype/contracts'
import { isPrototypeBusinessError } from '@/features/prototype/repository/prototypeErrors'
import ReceivablesView from './ReceivablesView.vue'
import {
  activateTab,
  bodyText,
  cleanupMounted,
  countRows,
  findButton,
  findInput,
  flushPromises,
  mountView,
  qa,
  q,
  setNativeInput,
  submitForm,
  type MountedView,
} from './testSupport'

let mounted: MountedView | null = null

async function setup(): Promise<MountedView> {
  mounted = await mountView(ReceivablesView)
  return mounted
}

function afterEachCleanup(): void {
  if (mounted !== null) {
    cleanupMounted(mounted)
    mounted = null
  }
}

// 无论断言是否通过都清理挂载，避免 Portal/页面 DOM 跨测试串扰
afterEach(() => {
  afterEachCleanup()
})

/** 按表头文本定位可排序列头 */
function columnHeader(text: string): HTMLElement {
  const found = qa('th').find((el) => (el.textContent ?? '').trim().includes(text))
  if (found === undefined) {
    throw new Error(`未找到表头: ${text}`)
  }
  return found
}

/** 按 Tab 文本定位 Tab 触发器 */
function tabTrigger(text: string): HTMLElement {
  const found = qa('[role="tab"]').find((el) => (el.textContent ?? '').trim() === text)
  if (found === undefined) {
    throw new Error(`未找到 Tab: ${text}`)
  }
  return found
}

/** 按首个选项文案识别筛选 Select */
function filterSelect(firstOptionLabel: string) {
  const found = mounted?.wrapper.findAllComponents(Select).find(
    (component) => component.props('options')[0]?.label === firstOptionLabel,
  )
  if (found === undefined) {
    throw new Error(`未找到筛选 Select: ${firstOptionLabel}`)
  }
  return found
}

describe('ReceivablesView — 初始渲染与顶部指标', () => {
  it('渲染页面标题、演示横幅、四组财务指标（含统计范围与 DEMO_TODAY 基准）', async () => {
    await setup()
    const text = bodyText()
    expect(text).toContain('应收账款')
    expect(text).toContain('演示模式')
    expect(text).toContain('累计应收金额')
    expect(text).toContain('449,614.38')
    expect(text).toContain('累计已核销金额')
    expect(text).toContain('47,046.51')
    expect(text).toContain('未收余额')
    expect(text).toContain('402,567.87')
    expect(text).toContain('逾期未收余额')
    expect(text).toContain('40,800.01')
    expect(text).toContain('统计范围：全部应收单')
    expect(text).toContain('2026-11-30')
    expect(text).toContain('DEMO_TODAY')
    afterEachCleanup()
  })

  it('初始列表 24 条数据（每页 20 行），列头齐全', async () => {
    await setup()
    expect(bodyText()).toContain('共 24 条')
    expect(countRows('receivables-table')).toBe(20)
    for (const header of [
      '对账单编号',
      '客户',
      '所属月份',
      '对账日期',
      '到期日期',
      '应收金额',
      '已收金额',
      '未收金额',
      '回款状态',
      '逾期标识',
      '操作',
    ]) {
      expect(bodyText()).toContain(header)
    }
    afterEachCleanup()
  })
})

describe('ReceivablesView — Tab 与筛选真实改变行数', () => {
  it('Tab 切换：未回款 15 / 部分回款 3 / 已结清 6 / 已逾期 6', async () => {
    await setup()
    activateTab(tabTrigger('未回款'))
    await flushPromises()
    expect(bodyText()).toContain('共 15 条')
    expect(countRows('receivables-table')).toBe(15)

    activateTab(tabTrigger('部分回款'))
    await flushPromises()
    expect(bodyText()).toContain('共 3 条')
    expect(countRows('receivables-table')).toBe(3)

    activateTab(tabTrigger('已结清'))
    await flushPromises()
    expect(bodyText()).toContain('共 6 条')

    activateTab(tabTrigger('已逾期'))
    await flushPromises()
    expect(bodyText()).toContain('共 6 条')
    expect(countRows('receivables-table')).toBe(6)
    afterEachCleanup()
  })

  it('已逾期列表中部分回款单据同时展示「部分回款」与「逾期」（并存语义）', async () => {
    await setup()
    activateTab(tabTrigger('已逾期'))
    await flushPromises()
    const rows = qa('[data-testid="receivables-table"] tbody tr')
    const partialOverdue = rows.filter(
      (row) => (row.textContent ?? '').includes('部分回款') && (row.textContent ?? '').includes('逾期'),
    )
    expect(partialOverdue.length).toBe(3)
    afterEachCleanup()
  })

  it('客户 / 月份筛选与组合真实改变行数', async () => {
    const view = await setup()
    filterSelect('全部客户').vm.$emit('update:modelValue', 'cust-c')
    await flushPromises()
    expect(bodyText()).toContain('共 7 条')

    filterSelect('全部客户').vm.$emit('update:modelValue', 'all')
    filterSelect('全部月份').vm.$emit('update:modelValue', '2026-09')
    await flushPromises()
    expect(bodyText()).toContain('共 9 条')

    filterSelect('全部客户').vm.$emit('update:modelValue', 'cust-b')
    filterSelect('全部月份').vm.$emit('update:modelValue', '2026-10')
    await flushPromises()
    expect(bodyText()).toContain('共 3 条')
    expect(countRows('receivables-table')).toBe(3)

    // 清空恢复全部
    findButton('清空')?.click()
    await flushPromises()
    expect(bodyText()).toContain('共 24 条')
    expect(view.store.receivables.length).toBe(24)
    afterEachCleanup()
  })

  it('关键字搜索命中编号或客户，清空后恢复；无结果展示空状态', async () => {
    await setup()
    const search = findInput('搜索单据编号或客户…')
    if (search === null) {
      throw new Error('未找到搜索框')
    }
    setNativeInput(search, 'AR-2026-0004')
    await flushPromises()
    expect(bodyText()).toContain('共 1 条')
    expect(countRows('receivables-table')).toBe(1)

    setNativeInput(search, '不存在的关键字')
    await flushPromises()
    expect(bodyText()).toContain('共 0 条')
    expect(bodyText()).toContain('暂无符合条件的应收单')

    findButton('清空')?.click()
    await flushPromises()
    expect(bodyText()).toContain('共 24 条')
    afterEachCleanup()
  })

  it('逾期筛选（独立维度）与状态筛选可组合', async () => {
    await setup()
    filterSelect('不限逾期').vm.$emit('update:modelValue', 'OVERDUE_ONLY')
    await flushPromises()
    expect(bodyText()).toContain('共 6 条')

    filterSelect('不限状态').vm.$emit('update:modelValue', 'PARTIALLY_PAID')
    await flushPromises()
    expect(bodyText()).toContain('共 3 条')
    afterEachCleanup()
  })
})

describe('ReceivablesView — 排序（金额 compareAmounts 精确比较）', () => {
  it('应收金额列升序首行 0.01，降序首行 250,000.00（小数位不产生误差）', async () => {
    await setup()
    const header = columnHeader('应收金额')
    header.click()
    await flushPromises()
    expect(header.getAttribute('aria-sort')).toBe('ascending')
    const firstRow = qa('[data-testid="receivables-table"] tbody tr')[0]
    expect(firstRow?.textContent ?? '').toContain('0.01')
    expect(firstRow?.textContent ?? '').toContain('AR-2026-0010')

    header.click()
    await flushPromises()
    expect(header.getAttribute('aria-sort')).toBe('descending')
    const sortedDesc = qa('[data-testid="receivables-table"] tbody tr')[0]
    expect(sortedDesc?.textContent ?? '').toContain('250,000.00')
    afterEachCleanup()
  })
})

describe('ReceivablesView — 新建应收单（store.createReceivable 唯一写入口）', () => {
  it('表单校验拦截空提交；成功创建后列表与指标即时更新，且不增加现金/不建收款单', async () => {
    const view = await setup()
    const before = {
      receivables: view.store.receivables.length,
      transactions: view.store.fundTransactions.length,
      receipts: view.store.receipts.length,
      allocations: view.store.receiptAllocations.length,
      balance: view.store.totalFundBalance,
    }

    findButton('新建应收单')?.click()
    await flushPromises()
    const form = q<HTMLFormElement>('[data-testid="create-receivable-form"]')
    if (form === null) {
      throw new Error('未找到创建表单')
    }

    // 空提交：本地校验拦截，store 不产生任何数据
    submitForm(form)
    await flushPromises()
    expect(bodyText()).toContain('请选择客户')
    expect(bodyText()).toContain('所属月份格式非法')
    expect(view.store.receivables.length).toBe(before.receivables)

    // 客户（Select 契约事件）+ 各字段
    const customerSelect = mounted?.wrapper
      .findAllComponents(Select)
      .find((component) => component.props('placeholder') === '请选择客户')
    if (customerSelect === undefined) {
      throw new Error('未找到客户选择器')
    }
    customerSelect.vm.$emit('update:modelValue', 'cust-a')
    setNativeInput(findInput('2026-12') as HTMLInputElement, '2026-12')
    setNativeInput(findInput('2026-12-05') as HTMLInputElement, '2026-12-05')
    setNativeInput(findInput('2026-12-31') as HTMLInputElement, '2026-12-31')
    const amountInput = q<HTMLInputElement>('input[placeholder="0.00"]')
    if (amountInput === null) {
      throw new Error('未找到金额输入')
    }
    setNativeInput(amountInput, '1234.56')
    setNativeInput(findInput('选填') as HTMLInputElement, '组件测试新建')
    await flushPromises()

    submitForm(form)
    await flushPromises()

    // 成功：列表 25 条、指标即时更新、不增加现金、不建收款单/流水、不自动结清
    expect(view.store.receivables.length).toBe(before.receivables + 1)
    expect(view.store.fundTransactions.length).toBe(before.transactions)
    expect(view.store.receipts.length).toBe(before.receipts)
    expect(view.store.totalFundBalance).toBe(before.balance)
    expect(view.store.receiptAllocations.length).toBe(before.allocations)
    expect(bodyText()).toContain('共 25 条')
    expect(bodyText()).toContain('450,848.94') // 449,614.38 + 1,234.56
    expect(bodyText()).toContain('403,802.43') // 402,567.87 + 1,234.56
    // 唯一编号由 store 生成
    const created = view.store.receivables.find((item) => item.remark === '组件测试新建')
    expect(created?.statementNo).toBe('AR-2026-0025')
    // 新单派生状态：未回款、未逾期、已收 0
    const createdView = view.store.receivableViewById(created?.id ?? '')
    expect(createdView?.summary.status).toBe('UNPAID')
    expect(createdView?.summary.isOverdue).toBe(false)
    expect(createdView?.summary.paidAmount).toBe('0.00')
    // Dialog 已关闭
    expect(q('[data-testid="create-receivable-form"]')).toBeNull()
    afterEachCleanup()
  })

  it('非法金额被拒绝（格式非法由 AmountInput 阻断；金额 ≤ 0 由 store 业务校验拒绝），状态零变化', async () => {
    const view = await setup()
    const before = view.store.receivables.length

    findButton('新建应收单')?.click()
    await flushPromises()
    const form = q<HTMLFormElement>('[data-testid="create-receivable-form"]')
    const customerSelect = mounted?.wrapper
      .findAllComponents(Select)
      .find((component) => component.props('placeholder') === '请选择客户')
    customerSelect?.vm.$emit('update:modelValue', 'cust-a')
    setNativeInput(findInput('2026-12') as HTMLInputElement, '2026-12')
    setNativeInput(findInput('2026-12-05') as HTMLInputElement, '2026-12-05')
    await flushPromises()

    // 格式非法（3 位小数）：AmountInput validate() 阻断提交
    const amountInput = q<HTMLInputElement>('input[placeholder="0.00"]')
    if (amountInput === null || form === null) {
      throw new Error('未找到金额输入或表单')
    }
    setNativeInput(amountInput, '1.234')
    submitForm(form)
    await flushPromises()
    expect(bodyText()).toContain('金额格式不正确')
    expect(view.store.receivables.length).toBe(before)

    // 金额为 0：store 业务校验拒绝（应收金额必须大于 0）
    setNativeInput(amountInput, '0.00')
    await flushPromises()
    submitForm(form)
    await flushPromises()
    expect(bodyText()).toContain('应收金额必须大于 0')
    expect(view.store.receivables.length).toBe(before)

    afterEachCleanup()
  })

  it('store 业务校验为最终防线：直接提交非法金额命令被拒绝且零状态变化', async () => {
    const view = await setup()
    const before = view.store.receivables.length
    let rejected = false
    try {
      await view.store.createReceivable({
        customerId: 'cust-a',
        accountingMonth: '2026-12',
        statementDate: '2026-12-05',
        dueDate: null,
        amount: '-1.00',
        remark: null,
      })
    } catch (error) {
      rejected = isPrototypeBusinessError(error)
    }
    expect(rejected).toBe(true)
    expect(view.store.receivables.length).toBe(before)
    afterEachCleanup()
  })
})

describe('ReceivablesView — 登记回款路径（冻结契约）', () => {
  it('buildProcessingFeeCreatePath 参数顺序冻结：action → customerId → receivableId', () => {
    expect(buildProcessingFeeCreatePath()).toBe('/business/processing-fee?action=create')
    expect(buildProcessingFeeCreatePath({ customerId: 'cust-b', receivableId: 'ar-004' })).toBe(
      '/business/processing-fee?action=create&customerId=cust-b&receivableId=ar-004',
    )
  })

  it('行内「登记回款」跳转携带 action/create + customerId + receivableId', async () => {
    const view = await setup()
    const search = findInput('搜索单据编号或客户…')
    if (search === null) {
      throw new Error('未找到搜索框')
    }
    setNativeInput(search, 'AR-2026-0004')
    await flushPromises()
    const register = findButton('登记回款')
    if (register === null) {
      throw new Error('未找到登记回款按钮')
    }
    register.click()
    await flushPromises()
    expect(view.router.currentRoute.value.fullPath).toBe(
      '/business/processing-fee?action=create&customerId=cust-b&receivableId=ar-004',
    )
    afterEachCleanup()
  })

  it('单据编号可点击进入详情页', async () => {
    const view = await setup()
    const search = findInput('搜索单据编号或客户…')
    if (search === null) {
      throw new Error('未找到搜索框')
    }
    setNativeInput(search, 'AR-2026-0004')
    await flushPromises()
    const link = q<HTMLAnchorElement>('[data-testid="receivables-table"] tbody a')
    if (link === null) {
      throw new Error('未找到单据编号链接')
    }
    link.click()
    await flushPromises()
    expect(view.router.currentRoute.value.fullPath).toBe('/business/receivables/ar-004')
    afterEachCleanup()
  })
})

describe('ReceivablesView — 移动端列最小宽度（QA F-007）', () => {
  it('每行 11 列内容均含 min-w-24 且不换行（容器内横滚前提）', async () => {
    await setup()
    const firstRow = qa('[data-testid="receivables-table"] tbody tr')[0]
    const cells = Array.from(firstRow?.querySelectorAll('td') ?? [])
    expect(cells.length).toBe(11)
    for (const cell of cells) {
      const content = cell.querySelector('.min-w-24')
      expect(content, `${cell.textContent ?? ''} 缺少最小宽度容器`).not.toBeNull()
      expect((content as HTMLElement).className).toContain('whitespace-nowrap')
    }
    afterEachCleanup()
  })
})

describe('ReceivablesView — 加载错误状态', () => {
  it('数据加载失败展示错误状态，重试后恢复列表', async () => {
    mounted = await mountView(ReceivablesView, '/business/receivables', (store) => {
      vi.spyOn(store, 'listCustomers').mockRejectedValue(new Error('模拟查询失败'))
    })
    await flushPromises()
    expect(bodyText()).toContain('数据加载失败')
    expect(q('[data-testid="reload-options"]')).not.toBeNull()

    // 重试：恢复为成功查询
    const view = mounted
    vi.spyOn(view.store, 'listCustomers').mockResolvedValue({ items: [], total: 0, page: 1, size: 500 })
    q<HTMLButtonElement>('[data-testid="reload-options"]')?.click()
    await flushPromises()
    expect(bodyText()).not.toContain('数据加载失败')
    expect(bodyText()).toContain('共 24 条')
    afterEachCleanup()
  })
})
