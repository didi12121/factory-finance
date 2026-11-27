/**
 * Phase 1 业务 API DTO —— 与 docs/API_CONTRACT.md 第 10 节对齐。
 *
 * 约定：
 * - 金额一律 `DecimalString`（十进制字符串，DECIMAL(18,2)），禁止 Number 承载财务金额；
 * - 业务日期一律 `LocalDate`（YYYY-MM-DD）；审计时间 `IsoDateTime`；
 * - 穀22值语义：可空字段显式 `| null`，禁止空字符串/魔法值表达空；
 * - 分页统一 `PageQuery` / `PageResult`（@/types/api）。
 */

import type { DecimalString } from '@/utils/decimal'
import type { PageQuery } from '@/types/api'

export type { DecimalString } from '@/utils/decimal'
export type { PageQuery, PageResult } from '@/types/api'

/** 内部主键（技术标识，与业务单据编号分离） */
export type EntityId = string

/** 业务日期（YYYY-MM-DD） */
export type LocalDate = string

/** ISO 日期时间（审计字段） */
export type IsoDateTime = string

/** 启用状态（客户/股东/资金账户主数据）：停用不可用于新单据，历史数据保留 */
export type EnableStatus = 'ENABLED' | 'DISABLED'

/** 资金账户类型（现金/银行/微信/支付宝等） */
export type FundAccountType = 'CASH' | 'BANK' | 'WECHAT' | 'ALIPAY' | 'OTHER'

/** 资金流水方向：单条账户流水方向二选一 */
export type TransactionDirection = 'IN' | 'OUT'

/**
 * 业务交易类型（资金流水分类）。
 * 业务与财务分离：类型表达业务性质，不决定会计科目。
 */
export type TransactionType =
  /** 加工费回款（实际收款，资金流入；≠ 加工收入确认） */
  | 'PROCESSING_FEE_RECEIPT'
  /** 股东出资（计入所有者权益，禁止计入营业收入） */
  | 'SHAREHOLDER_CONTRIBUTION'
  /** 工资支出 */
  | 'SALARY'
  /** 水电费支出 */
  | 'UTILITIES'
  /** 采购支出 */
  | 'PURCHASE'
  /** 内部转账（账户间划转，不产生收支，仅改变资金分布） */
  | 'INTERNAL_TRANSFER'
  /** 其他 */
  | 'OTHER'

/** 支出分类（支出单业务分类） */
export type ExpenseCategory = 'SALARY' | 'UTILITIES' | 'PURCHASE' | 'OTHER'

/** 业务单据状态：已确认 / 已撤销（撤销保留原单据 + 反向流水，禁止物理删除） */
export type RecordStatus = 'CONFIRMED' | 'VOIDED'

/** 资金流水状态：已入账（参与余额重算）/ 已作废（不参与余额重算） */
export type TransactionStatus = 'RECORDED' | 'VOIDED'

/** 资金流水来源单据类型（回溯链；与 sourceDocId 成对出现） */
export type SourceDocType =
  | 'CONTRIBUTION'
  | 'EXPENSE'
  | 'TRANSFER'
  | 'RECEIPT'
  | 'PAYROLL'
  | 'PURCHASE'
  | 'OTHER'

/* ------------------------------- 认证 ------------------------------- */

/** 登录返回的当前用户 */
export interface AuthUser {
  id: EntityId
  username: string
  /** 显示名；null 时前端回退显示 username */
  displayName: string | null
}

/** 登录成功响应（POST /auth/login） */
export interface LoginResult {
  accessToken: string
  tokenType: string
  /** 过期时间（Epoch 秒） */
  expiresAt: number
  user: AuthUser
}

/** 登录请求 */
export interface LoginInput {
  username: string
  password: string
}

/** 修改密码请求（PUT /auth/password） */
export interface ChangePasswordInput {
  oldPassword: string
  newPassword: string
}

/* ------------------------------ 主数据 ------------------------------ */

/** 客户（编号后端生成，前端不传） */
export interface Customer {
  id: EntityId
  customerNo: string
  name: string
  contact: string | null
  phone: string | null
  address: string | null
  status: EnableStatus
  remark: string | null
  createdAt: IsoDateTime
}

/** 客户新增/更新载荷 */
export interface CustomerInput {
  name: string
  contact?: string | null
  phone?: string | null
  address?: string | null
  remark?: string | null
  status?: EnableStatus
}

/** 股东（编号后端生成，前端不传） */
export interface Shareholder {
  id: EntityId
  shareholderNo: string
  name: string
  contact: string | null
  phone: string | null
  status: EnableStatus
  remark: string | null
  createdAt: IsoDateTime
}

/** 股东新增/更新载荷 */
export interface ShareholderInput {
  name: string
  contact?: string | null
  phone?: string | null
  remark?: string | null
  status?: EnableStatus
}

/** 资金账户（编号后端生成；余额由有效流水重算） */
export interface FundAccount {
  id: EntityId
  accountNo: string
  name: string
  accountType: FundAccountType
  /** 本位币，第一版固定 CNY */
  currency: string
  /** 期初余额（DECIMAL(18,2)） */
  openingBalance: DecimalString
  openingDate: string
  status: EnableStatus
  /**
   * 当前余额（= 期初余额 + Σ有效流入 − Σ有效流出，由流水重算）。
   * 后端未提供时为 null，前端显示 '—'，禁止显假数字。
   */
  currentBalance: DecimalString | null
  remark: string | null
  createdAt: IsoDateTime
}

/** 资金账户新增/更新载荷（字段名对齐后端 CreateAccountRequest） */
export interface FundAccountInput {
  name: string
  accountType: FundAccountType
  openingBalance: DecimalString
  openingDate: string
  remark?: string | null
  status?: EnableStatus
}

/* ------------------------------ 业务单据 ----------------------------- */

/** 股东出资单（确认时同事务生成 IN 流水；字段名对齐后端 ContributionView） */
export interface ContributionRecord {
  id?: EntityId
  docNo: string
  shareholderName: string
  contributionDate: LocalDate
  accountName: string
  amount: DecimalString
  remark: string | null
  status: RecordStatus
  voidNo?: string | null
  voidDate?: string | null
  createdAt: IsoDateTime
  createdBy?: string
}

/** 股东出资录入载荷（字段名对齐后端 CreateContributionRequest） */
export interface ContributionInput {
  shareholderId: number
  accountId: number
  contributionDate: LocalDate
  amount: DecimalString
  remark?: string | null
}

/** 支出单（确认时同事务生成 OUT 流水；字段名对齐后端 ExpenseView） */
export interface ExpenseRecord {
  id?: EntityId
  docNo: string
  category: ExpenseCategory
  content: string
  bizMonth?: string | null
  payDate: LocalDate
  accountName: string
  amount: DecimalString
  payee?: string | null
  employeeName?: string | null
  salaryMonth?: string | null
  attachmentRef?: string | null
  remark: string | null
  status: RecordStatus
  voidNo?: string | null
  voidDate?: string | null
  createdAt: IsoDateTime
  createdBy?: string
}

/** 支出录入载荷（字段名对齐后端 CreateExpenseRequest） */
export interface ExpenseInput {
  category: ExpenseCategory
  content: string
  bizMonth?: string | null
  payDate: LocalDate
  accountId: number
  amount: DecimalString
  payee?: string | null
  employeeName?: string | null
  salaryMonth?: string | null
  attachmentRef?: string | null
  remark?: string | null
}

/** 内部转账单（确认时同事务生成 OUT+IN 成对流水；字段名对齐后端 TransferView） */
export interface TransferRecord {
  id?: EntityId
  docNo: string
  transferDate: LocalDate
  fromAccountName: string
  toAccountName: string
  amount: DecimalString
  remark: string | null
  status: RecordStatus
  voidNo?: string | null
  voidDate?: string | null
  createdAt: IsoDateTime
  createdBy?: string
}

/** 转账录入载荷（字段名对齐后端 CreateTransferRequest） */
export interface TransferInput {
  transferDate: LocalDate
  fromAccountId: number
  toAccountId: number
  amount: DecimalString
  remark?: string | null
}

/** 业务单据列表查询（分页 + 关键字 + 日期范围 + 状态） */
export interface RecordListQuery extends PageQuery {
  keyword?: string
  from?: LocalDate
  to?: LocalDate
  status?: RecordStatus
}

/* ------------------------------ 资金流水 ----------------------------- */

/**
 * 资金流水（单条账户收付/转账记录）。
 * 单条流水金额恒为正数，收付方向由 direction 表达。
 */
export interface FundTransaction {
  id: EntityId
  transactionNo: string
  transactionType: TransactionType
  tradeDate: LocalDate
  accountId: EntityId
  direction: TransactionDirection
  amount: DecimalString
  counterparty: string | null
  sourceDocType: SourceDocType | null
  sourceDocId: EntityId | null
  /** 内部转账关联 ID：同一笔转账的 OUT/IN 两条流水共享同一值 */
  transferGroupId: EntityId | null
  status: TransactionStatus
  remark: string | null
  createdAt: IsoDateTime
  /** 撤销/作废时间；有效流水为 null */
  voidedAt: IsoDateTime | null
}

/** 资金流水查询（分页 + 搜索 + 日期 + 账户 + 类型 + 方向） */
export interface TransactionQuery extends PageQuery {
  keyword?: string
  from?: LocalDate
  to?: LocalDate
  accountId?: EntityId
  transactionType?: TransactionType
  direction?: TransactionDirection
}

/* ------------------------------ 经营概览 ----------------------------- */

/** 资金收付趋势点（按日聚合实际资金收付） */
export interface CashFlowTrendPoint {
  date: LocalDate
  inflow: DecimalString
  outflow: DecimalString
}

/** 支出分类统计（实际支出按分类聚合） */
export interface ExpenseCategoryStat {
  category: TransactionType
  amount: DecimalString
}

/** 资金收付趋势点（后端 TrendPoint） */
export interface CashFlowTrendPoint {
  date: string
  inflow: DecimalString
  outflow: DecimalString
  correctionIn: DecimalString
  correctionOut: DecimalString
}

/** 经营概览统计（GET /treasury/dashboard/summary?from&to）——字段名对齐后端 DashboardSummary */
export interface DashboardSummary {
  from: LocalDate
  to: LocalDate
  currentBalance: DecimalString
  periodContributionTotal: DecimalString
  periodExpenseTotal: DecimalString
  periodExternalInflow: DecimalString
  periodExternalOutflow: DecimalString
  calibers: Record<string, string>
  trend: CashFlowTrendPoint[]
  recentTransactions: FundTransaction[]
  /** 支出分类（后端暂未提供，待开通） */
  expenseBreakdown?: ExpenseCategoryStat[]
}
