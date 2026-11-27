/**
 * Prototype Contract V1 — 枚举/字面量联合类型（共享数据契约，不实现业务逻辑）。
 *
 * 约定：
 * - 枚举值使用字符串字面量联合类型（与后端 VARCHAR + 应用层枚举校验的落库方式对齐）；
 * - 枚举值一经冻结不得改名（演示数据、Mock Store 与四个页面 Agent 共同依赖）；
 * - 语义与 docs/ACCOUNTING_RULES.md、docs/DATABASE_DESIGN.md 保持一致。
 */

/** 资金流水方向：单条账户流水方向二选一（IN 流入 / OUT 流出） */
export type TransactionDirection = 'IN' | 'OUT'

/**
 * 业务交易类型（资金流水分类）。
 * 业务与财务分离：类型表达业务性质，不决定会计科目（科目表待架构师确认）。
 */
export type TransactionType =
  /** 加工费收款（实际收款，资金流入；≠ 加工收入确认） */
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

/**
 * 应收回款状态（由核销明细派生，禁止冗余存储）：
 * - UNPAID：未收（累计核销 = 0）
 * - PARTIALLY_PAID：部分核销（0 < 累计核销 < 原始应收金额）
 * - SETTLED：已结清（累计核销 = 原始应收金额）
 *
 * 不变量：**逾期是独立派生属性**（见 ReceivableSummary.isOverdue），
 * 禁止用 OVERDUE 替代/混入回款状态。
 */
export type ReceivableStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'SETTLED'

/**
 * 启用状态（客户/账户等主数据的启用-停用语义）：
 * - ENABLED：启用，可参与新业务单据
 * - DISABLED：停用，不可用于新单据；历史数据保留
 */
export type EnableStatus = 'ENABLED' | 'DISABLED'

/** 客户启用状态（主数据启用/停用） */
export type CustomerStatus = EnableStatus

/**
 * 资金账户类型（与数据库草案 account_type 对齐：现金/银行/微信/支付宝等）。
 * 停用账户（FundAccount.enabled=false）不可新增流水，历史流水保留。
 */
export type FundAccountType = 'CASH' | 'BANK' | 'WECHAT' | 'ALIPAY' | 'OTHER'

/**
 * 资金流水状态：
 * - RECORDED：已入账（参与余额重算）
 * - VOIDED：已作废（不参与余额重算；更正必须走明确撤销/冲销流程，禁止物理删除）
 */
export type FundTransactionStatus = 'RECORDED' | 'VOIDED'

/**
 * 资金流水来源单据类型（回溯链）。
 * 与 sourceDocId 成对出现；手工录入无来源单据时两者均为 null。
 */
export type FundSourceDocType =
  /** 收款单（rec_receipt） */
  | 'RECEIPT'
  /** 费用单（费用管理） */
  | 'EXPENSE'
  /** 工资单 */
  | 'PAYROLL'
  /** 采购单 */
  | 'PURCHASE'
  /** 股东往来单 */
  | 'SHAREHOLDER_TRANSACTION'
  /** 内部转账单（一笔转账对应 OUT/IN 两条流水，transferGroupId 关联） */
  | 'INTERNAL_TRANSFER'
