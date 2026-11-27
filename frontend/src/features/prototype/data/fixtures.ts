/**
 * 确定性虚构演示数据（DEMO FIXTURES）—— Prototype Engine 唯一初始数据源。
 *
 * 演示数据隔离说明（DEMO DATA ISOLATION）：
 * - 本文件全部为**虚构演示数据**（确定性、非随机），仅用于开发/测试环境原型演示；
 * - 不含任何真实姓名、真实银行账户、真实客户或真实 Excel 业务数据；
 * - 页面刷新 / Store 重建时数据恢复为本文件的初始状态（`createInitialPrototypeState()`），
 *   不写入任何后端、不持久化、不落数据库；
 * - 日期围绕统一演示基准 `DEMO_TODAY = '2026-11-30'` 固定，禁止使用真实当前时间。
 *
 * 覆盖矩阵（供四个页面 Agent 与跨模块验证使用）：
 * - 客户 5 个（示例客户 A–D 启用、示例客户 E 停用）、资金账户 4 个（银行/现金/微信启用 + 支付宝停用）；
 * - 应收单 24 张（> 一页 20 条），会计期间 2026-09 ~ 2026-11；
 *   状态覆盖：未回款 / 部分回款 / 已结清 / 逾期（dueDate < DEMO_TODAY 且未收清）/ 未到期（dueDate ≥ DEMO_TODAY 或空）；
 *   金额覆盖：0.01 元级（ar-010 / ar-013 / ar-020 尾差）与大金额（ar-011 250,000.00）；
 * - 收款单 8 张：单次回款（rc-001/rc-006）、多次回款同一应收（ar-004 ← rc-002 + rc-003）、
 *   多对多核销（rc-003 → ar-004 + ar-008；rc-004 → ar-006 + ar-007）；
 * - 资金流水 22 条：加工费回款(IN)、股东出资(IN)、工资/水电/采购支出(OUT)、其他支出(OUT)、
 *   作废流水(VOIDED 不参与余额重算)、内部转账成对流水 2 组（tg-001 / tg-002，OUT+IN 同额）。
 *
 * 跨模块验证场景（Agent H 实测，初始状态保证可重复）：
 * - 示例客户 A 持有应收单 A = ar-001（8,000.00）、应收单 B = ar-002（12,000.00），均未回款；
 * - 运行时登记 15,000.00 回款并核销 8,000.00 + 7,000.00 后：
 *   ar-001 → 已结清（未收 0.00）、ar-002 → 部分回款（未收 5,000.00）。
 */

import type {
  Customer,
  FundAccount,
  FundTransaction,
  Receipt,
  ReceiptAllocation,
  Receivable,
} from '../contracts'
import type { PrototypeState } from '../repository/state'

/** 虚构客户（主数据） */
export const DEMO_CUSTOMERS: Customer[] = [
  { id: 'cust-a', name: '示例客户 A', status: 'ENABLED' },
  { id: 'cust-b', name: '示例客户 B', status: 'ENABLED' },
  { id: 'cust-c', name: '示例客户 C', status: 'ENABLED' },
  { id: 'cust-d', name: '示例客户 D', status: 'ENABLED' },
  { id: 'cust-e', name: '示例客户 E', status: 'DISABLED' },
]

/** 虚构资金账户（期初余额为演示值，余额一律由流水重算） */
export const DEMO_FUND_ACCOUNTS: FundAccount[] = [
  { id: 'acct-bank', name: '示例银行账户', accountType: 'BANK', openingBalance: '100000.00', enabled: true },
  { id: 'acct-cash', name: '示例现金账户', accountType: 'CASH', openingBalance: '20000.00', enabled: true },
  { id: 'acct-wechat', name: '示例微信账户', accountType: 'WECHAT', openingBalance: '5000.00', enabled: true },
  { id: 'acct-alipay', name: '示例停用账户', accountType: 'ALIPAY', openingBalance: '1000.00', enabled: false },
]

/** 虚构应收单（加工费对账单，24 张覆盖分页/状态/逾期/金额矩阵） */
export const DEMO_RECEIVABLES: Receivable[] = [
  { id: 'ar-001', statementNo: 'AR-2026-0001', customerId: 'cust-a', accountingMonth: '2026-11', statementDate: '2026-11-25', dueDate: '2026-12-15', originalAmount: '8000.00', remark: '跨模块演示场景：应收单 A', createdAt: '2026-11-25T09:00:00' },
  { id: 'ar-002', statementNo: 'AR-2026-0002', customerId: 'cust-a', accountingMonth: '2026-11', statementDate: '2026-11-25', dueDate: '2026-12-20', originalAmount: '12000.00', remark: '跨模块演示场景：应收单 B', createdAt: '2026-11-25T09:01:00' },
  { id: 'ar-003', statementNo: 'AR-2026-0003', customerId: 'cust-a', accountingMonth: '2026-09', statementDate: '2026-09-28', dueDate: '2026-10-28', originalAmount: '6500.00', remark: null, createdAt: '2026-09-28T09:00:00' },
  { id: 'ar-004', statementNo: 'AR-2026-0004', customerId: 'cust-b', accountingMonth: '2026-09', statementDate: '2026-09-30', dueDate: '2026-11-20', originalAmount: '20000.00', remark: '多次回款核销演示', createdAt: '2026-09-30T09:00:00' },
  { id: 'ar-005', statementNo: 'AR-2026-0005', customerId: 'cust-b', accountingMonth: '2026-10', statementDate: '2026-10-31', dueDate: '2026-11-30', originalAmount: '5000.00', remark: '到期日当天未收不判逾期', createdAt: '2026-10-31T09:00:00' },
  { id: 'ar-006', statementNo: 'AR-2026-0006', customerId: 'cust-b', accountingMonth: '2026-10', statementDate: '2026-10-15', dueDate: '2026-11-15', originalAmount: '5000.00', remark: null, createdAt: '2026-10-15T09:00:00' },
  { id: 'ar-007', statementNo: 'AR-2026-0007', customerId: 'cust-b', accountingMonth: '2026-10', statementDate: '2026-10-15', dueDate: null, originalAmount: '3200.50', remark: '0.01 级金额演示', createdAt: '2026-10-15T09:01:00' },
  { id: 'ar-008', statementNo: 'AR-2026-0008', customerId: 'cust-b', accountingMonth: '2026-09', statementDate: '2026-09-15', dueDate: '2026-10-15', originalAmount: '1000.00', remark: null, createdAt: '2026-09-15T09:00:00' },
  { id: 'ar-009', statementNo: 'AR-2026-0009', customerId: 'cust-c', accountingMonth: '2026-09', statementDate: '2026-09-30', dueDate: '2026-10-31', originalAmount: '9999.99', remark: '逾期未回款演示', createdAt: '2026-09-30T09:01:00' },
  { id: 'ar-010', statementNo: 'AR-2026-0010', customerId: 'cust-c', accountingMonth: '2026-09', statementDate: '2026-09-30', dueDate: '2026-10-15', originalAmount: '0.01', remark: '0.01 元应收演示', createdAt: '2026-09-30T09:02:00' },
  { id: 'ar-011', statementNo: 'AR-2026-0011', customerId: 'cust-c', accountingMonth: '2026-10', statementDate: '2026-10-30', dueDate: null, originalAmount: '250000.00', remark: '大金额演示', createdAt: '2026-10-30T09:00:00' },
  { id: 'ar-012', statementNo: 'AR-2026-0012', customerId: 'cust-c', accountingMonth: '2026-11', statementDate: '2026-11-28', dueDate: '2026-12-31', originalAmount: '15000.00', remark: null, createdAt: '2026-11-28T09:00:00' },
  { id: 'ar-013', statementNo: 'AR-2026-0013', customerId: 'cust-c', accountingMonth: '2026-11', statementDate: '2026-11-28', dueDate: '2026-12-10', originalAmount: '0.10', remark: null, createdAt: '2026-11-28T09:01:00' },
  { id: 'ar-014', statementNo: 'AR-2026-0014', customerId: 'cust-d', accountingMonth: '2026-09', statementDate: '2026-09-25', dueDate: '2026-10-25', originalAmount: '7200.35', remark: '部分回款与逾期并存演示', createdAt: '2026-09-25T09:00:00' },
  { id: 'ar-015', statementNo: 'AR-2026-0015', customerId: 'cust-d', accountingMonth: '2026-10', statementDate: '2026-10-20', dueDate: '2026-11-20', originalAmount: '18800.00', remark: '逾期未回款演示', createdAt: '2026-10-20T09:00:00' },
  { id: 'ar-016', statementNo: 'AR-2026-0016', customerId: 'cust-d', accountingMonth: '2026-10', statementDate: '2026-10-20', dueDate: '2026-12-05', originalAmount: '6600.66', remark: null, createdAt: '2026-10-20T09:01:00' },
  { id: 'ar-017', statementNo: 'AR-2026-0017', customerId: 'cust-d', accountingMonth: '2026-11', statementDate: '2026-11-30', dueDate: null, originalAmount: '3000.00', remark: null, createdAt: '2026-11-30T09:00:00' },
  { id: 'ar-018', statementNo: 'AR-2026-0018', customerId: 'cust-b', accountingMonth: '2026-11', statementDate: '2026-11-30', dueDate: '2026-12-30', originalAmount: '4500.45', remark: null, createdAt: '2026-11-30T09:01:00' },
  { id: 'ar-019', statementNo: 'AR-2026-0019', customerId: 'cust-c', accountingMonth: '2026-10', statementDate: '2026-10-10', dueDate: '2026-11-10', originalAmount: '2200.00', remark: null, createdAt: '2026-10-10T09:00:00' },
  { id: 'ar-020', statementNo: 'AR-2026-0020', customerId: 'cust-d', accountingMonth: '2026-09', statementDate: '2026-09-10', dueDate: '2026-10-10', originalAmount: '12345.67', remark: '0.01 元尾差演示', createdAt: '2026-09-10T09:00:00' },
  { id: 'ar-021', statementNo: 'AR-2026-0021', customerId: 'cust-b', accountingMonth: '2026-09', statementDate: '2026-09-05', dueDate: null, originalAmount: '888.88', remark: null, createdAt: '2026-09-05T09:00:00' },
  { id: 'ar-022', statementNo: 'AR-2026-0022', customerId: 'cust-c', accountingMonth: '2026-11', statementDate: '2026-11-15', dueDate: '2026-12-15', originalAmount: '56000.00', remark: null, createdAt: '2026-11-15T09:00:00' },
  { id: 'ar-023', statementNo: 'AR-2026-0023', customerId: 'cust-d', accountingMonth: '2026-11', statementDate: '2026-11-20', dueDate: '2026-12-20', originalAmount: '777.77', remark: null, createdAt: '2026-11-20T09:00:00' },
  { id: 'ar-024', statementNo: 'AR-2026-0024', customerId: 'cust-e', accountingMonth: '2026-09', statementDate: '2026-09-08', dueDate: '2026-10-08', originalAmount: '1600.00', remark: '历史客户演示', createdAt: '2026-09-08T09:00:00' },
]

/** 虚构收款单（一笔收款只对应一条资金流入流水） */
export const DEMO_RECEIPTS: Receipt[] = [
  { id: 'rc-001', receiptNo: 'SK-2026-0001', customerId: 'cust-a', receiptDate: '2026-11-10', accountId: 'acct-bank', actualAmount: '6500.00', fundTransactionId: 'txn-013', externalRef: 'BANK-REF-0001', remark: null, idempotencyKey: 'demo-rc-001' },
  { id: 'rc-002', receiptNo: 'SK-2026-0002', customerId: 'cust-b', receiptDate: '2026-11-05', accountId: 'acct-bank', actualAmount: '8000.00', fundTransactionId: 'txn-010', externalRef: 'BANK-REF-0002', remark: null, idempotencyKey: 'demo-rc-002' },
  { id: 'rc-003', receiptNo: 'SK-2026-0003', customerId: 'cust-b', receiptDate: '2026-11-18', accountId: 'acct-bank', actualAmount: '5000.00', fundTransactionId: 'txn-016', externalRef: 'BANK-REF-0003', remark: '多单核销演示', idempotencyKey: 'demo-rc-003' },
  { id: 'rc-004', receiptNo: 'SK-2026-0004', customerId: 'cust-b', receiptDate: '2026-10-20', accountId: 'acct-wechat', actualAmount: '8200.50', fundTransactionId: 'txn-008', externalRef: 'WX-REF-0004', remark: '多单核销演示', idempotencyKey: 'demo-rc-004' },
  { id: 'rc-005', receiptNo: 'SK-2026-0005', customerId: 'cust-d', receiptDate: '2026-11-08', accountId: 'acct-cash', actualAmount: '3200.35', fundTransactionId: 'txn-011', externalRef: null, remark: '现金收款演示', idempotencyKey: 'demo-rc-005' },
  { id: 'rc-006', receiptNo: 'SK-2026-0006', customerId: 'cust-c', receiptDate: '2026-11-12', accountId: 'acct-bank', actualAmount: '2200.00', fundTransactionId: 'txn-014', externalRef: 'BANK-REF-0006', remark: null, idempotencyKey: 'demo-rc-006' },
  { id: 'rc-007', receiptNo: 'SK-2026-0007', customerId: 'cust-d', receiptDate: '2026-11-22', accountId: 'acct-bank', actualAmount: '12345.66', fundTransactionId: 'txn-019', externalRef: 'BANK-REF-0007', remark: '0.01 元尾差演示', idempotencyKey: 'demo-rc-007' },
  { id: 'rc-008', receiptNo: 'SK-2026-0008', customerId: 'cust-e', receiptDate: '2026-10-15', accountId: 'acct-cash', actualAmount: '1600.00', fundTransactionId: 'txn-007', externalRef: null, remark: '历史客户结清演示', idempotencyKey: 'demo-rc-008' },
]

/** 虚构核销明细（收款单 ↔ 应收单 多对多；核销不产生新资金流水） */
export const DEMO_RECEIPT_ALLOCATIONS: ReceiptAllocation[] = [
  { id: 'alloc-001', receiptId: 'rc-001', receivableId: 'ar-003', allocationAmount: '6500.00', allocatedAt: '2026-11-10T10:05:00' },
  { id: 'alloc-002', receiptId: 'rc-002', receivableId: 'ar-004', allocationAmount: '8000.00', allocatedAt: '2026-11-05T10:05:00' },
  { id: 'alloc-003', receiptId: 'rc-003', receivableId: 'ar-004', allocationAmount: '4000.00', allocatedAt: '2026-11-18T10:05:00' },
  { id: 'alloc-004', receiptId: 'rc-003', receivableId: 'ar-008', allocationAmount: '1000.00', allocatedAt: '2026-11-18T10:06:00' },
  { id: 'alloc-005', receiptId: 'rc-004', receivableId: 'ar-006', allocationAmount: '5000.00', allocatedAt: '2026-10-20T15:05:00' },
  { id: 'alloc-006', receiptId: 'rc-004', receivableId: 'ar-007', allocationAmount: '3200.50', allocatedAt: '2026-10-20T15:06:00' },
  { id: 'alloc-007', receiptId: 'rc-005', receivableId: 'ar-014', allocationAmount: '3200.35', allocatedAt: '2026-11-08T11:05:00' },
  { id: 'alloc-008', receiptId: 'rc-006', receivableId: 'ar-019', allocationAmount: '2200.00', allocatedAt: '2026-11-12T10:05:00' },
  { id: 'alloc-009', receiptId: 'rc-007', receivableId: 'ar-020', allocationAmount: '12345.66', allocatedAt: '2026-11-22T10:05:00' },
  { id: 'alloc-010', receiptId: 'rc-008', receivableId: 'ar-024', allocationAmount: '1600.00', allocatedAt: '2026-10-15T14:05:00' },
]

/** 虚构资金流水（单条金额恒正，方向由 direction 表达；含 1 条 VOIDED 与 2 组内部转账成对流水） */
export const DEMO_FUND_TRANSACTIONS: FundTransaction[] = [
  { id: 'txn-001', transactionNo: 'FT-2026-0001', transactionType: 'SHAREHOLDER_CONTRIBUTION', tradeDate: '2026-09-01', accountId: 'acct-bank', direction: 'IN', amount: '50000.00', counterparty: '示例股东甲', sourceDocType: 'SHAREHOLDER_TRANSACTION', sourceDocId: 'sh-001', transferGroupId: null, status: 'RECORDED', remark: '股东出资演示（不计营业收入）', createdAt: '2026-09-01T09:00:00' },
  { id: 'txn-002', transactionNo: 'FT-2026-0002', transactionType: 'PURCHASE', tradeDate: '2026-09-20', accountId: 'acct-bank', direction: 'OUT', amount: '45000.00', counterparty: '示例供应商甲', sourceDocType: 'PURCHASE', sourceDocId: 'po-001', transferGroupId: null, status: 'RECORDED', remark: null, createdAt: '2026-09-20T10:00:00' },
  { id: 'txn-003', transactionNo: 'FT-2026-0003', transactionType: 'SALARY', tradeDate: '2026-09-30', accountId: 'acct-bank', direction: 'OUT', amount: '28000.00', counterparty: null, sourceDocType: 'PAYROLL', sourceDocId: 'payroll-2026-09', transferGroupId: null, status: 'RECORDED', remark: '9 月工资演示', createdAt: '2026-09-30T17:00:00' },
  { id: 'txn-004', transactionNo: 'FT-2026-0004', transactionType: 'UTILITIES', tradeDate: '2026-10-08', accountId: 'acct-cash', direction: 'OUT', amount: '1234.56', counterparty: '示例物业', sourceDocType: 'EXPENSE', sourceDocId: 'exp-001', transferGroupId: null, status: 'RECORDED', remark: null, createdAt: '2026-10-08T09:30:00' },
  { id: 'txn-005', transactionNo: 'FT-2026-0005', transactionType: 'INTERNAL_TRANSFER', tradeDate: '2026-10-12', accountId: 'acct-cash', direction: 'OUT', amount: '2000.00', counterparty: '示例微信账户', sourceDocType: 'INTERNAL_TRANSFER', sourceDocId: 'tg-002', transferGroupId: 'tg-002', status: 'RECORDED', remark: '内部转账演示（成对流水）', createdAt: '2026-10-12T11:00:00' },
  { id: 'txn-006', transactionNo: 'FT-2026-0006', transactionType: 'INTERNAL_TRANSFER', tradeDate: '2026-10-12', accountId: 'acct-wechat', direction: 'IN', amount: '2000.00', counterparty: '示例现金账户', sourceDocType: 'INTERNAL_TRANSFER', sourceDocId: 'tg-002', transferGroupId: 'tg-002', status: 'RECORDED', remark: '内部转账演示（成对流水）', createdAt: '2026-10-12T11:00:00' },
  { id: 'txn-007', transactionNo: 'FT-2026-0007', transactionType: 'PROCESSING_FEE_RECEIPT', tradeDate: '2026-10-15', accountId: 'acct-cash', direction: 'IN', amount: '1600.00', counterparty: '示例客户 E', sourceDocType: 'RECEIPT', sourceDocId: 'rc-008', transferGroupId: null, status: 'RECORDED', remark: null, createdAt: '2026-10-15T14:00:00' },
  { id: 'txn-008', transactionNo: 'FT-2026-0008', transactionType: 'PROCESSING_FEE_RECEIPT', tradeDate: '2026-10-20', accountId: 'acct-wechat', direction: 'IN', amount: '8200.50', counterparty: '示例客户 B', sourceDocType: 'RECEIPT', sourceDocId: 'rc-004', transferGroupId: null, status: 'RECORDED', remark: null, createdAt: '2026-10-20T15:00:00' },
  { id: 'txn-009', transactionNo: 'FT-2026-0009', transactionType: 'SALARY', tradeDate: '2026-10-31', accountId: 'acct-bank', direction: 'OUT', amount: '28000.00', counterparty: null, sourceDocType: 'PAYROLL', sourceDocId: 'payroll-2026-10', transferGroupId: null, status: 'RECORDED', remark: '10 月工资演示', createdAt: '2026-10-31T17:00:00' },
  { id: 'txn-010', transactionNo: 'FT-2026-0010', transactionType: 'PROCESSING_FEE_RECEIPT', tradeDate: '2026-11-05', accountId: 'acct-bank', direction: 'IN', amount: '8000.00', counterparty: '示例客户 B', sourceDocType: 'RECEIPT', sourceDocId: 'rc-002', transferGroupId: null, status: 'RECORDED', remark: null, createdAt: '2026-11-05T10:00:00' },
  { id: 'txn-011', transactionNo: 'FT-2026-0011', transactionType: 'PROCESSING_FEE_RECEIPT', tradeDate: '2026-11-08', accountId: 'acct-cash', direction: 'IN', amount: '3200.35', counterparty: '示例客户 D', sourceDocType: 'RECEIPT', sourceDocId: 'rc-005', transferGroupId: null, status: 'RECORDED', remark: null, createdAt: '2026-11-08T11:00:00' },
  { id: 'txn-012', transactionNo: 'FT-2026-0012', transactionType: 'UTILITIES', tradeDate: '2026-11-08', accountId: 'acct-cash', direction: 'OUT', amount: '1350.00', counterparty: '示例物业', sourceDocType: 'EXPENSE', sourceDocId: 'exp-002', transferGroupId: null, status: 'RECORDED', remark: null, createdAt: '2026-11-08T11:30:00' },
  { id: 'txn-013', transactionNo: 'FT-2026-0013', transactionType: 'PROCESSING_FEE_RECEIPT', tradeDate: '2026-11-10', accountId: 'acct-bank', direction: 'IN', amount: '6500.00', counterparty: '示例客户 A', sourceDocType: 'RECEIPT', sourceDocId: 'rc-001', transferGroupId: null, status: 'RECORDED', remark: null, createdAt: '2026-11-10T10:00:00' },
  { id: 'txn-014', transactionNo: 'FT-2026-0014', transactionType: 'PROCESSING_FEE_RECEIPT', tradeDate: '2026-11-12', accountId: 'acct-bank', direction: 'IN', amount: '2200.00', counterparty: '示例客户 C', sourceDocType: 'RECEIPT', sourceDocId: 'rc-006', transferGroupId: null, status: 'RECORDED', remark: null, createdAt: '2026-11-12T10:00:00' },
  { id: 'txn-015', transactionNo: 'FT-2026-0015', transactionType: 'PURCHASE', tradeDate: '2026-11-15', accountId: 'acct-bank', direction: 'OUT', amount: '12000.50', counterparty: '示例供应商甲', sourceDocType: 'PURCHASE', sourceDocId: 'po-002', transferGroupId: null, status: 'RECORDED', remark: null, createdAt: '2026-11-15T14:00:00' },
  { id: 'txn-016', transactionNo: 'FT-2026-0016', transactionType: 'PROCESSING_FEE_RECEIPT', tradeDate: '2026-11-18', accountId: 'acct-bank', direction: 'IN', amount: '5000.00', counterparty: '示例客户 B', sourceDocType: 'RECEIPT', sourceDocId: 'rc-003', transferGroupId: null, status: 'RECORDED', remark: null, createdAt: '2026-11-18T10:00:00' },
  { id: 'txn-017', transactionNo: 'FT-2026-0017', transactionType: 'INTERNAL_TRANSFER', tradeDate: '2026-11-20', accountId: 'acct-bank', direction: 'OUT', amount: '10000.00', counterparty: '示例现金账户', sourceDocType: 'INTERNAL_TRANSFER', sourceDocId: 'tg-001', transferGroupId: 'tg-001', status: 'RECORDED', remark: '内部转账演示（成对流水）', createdAt: '2026-11-20T11:00:00' },
  { id: 'txn-018', transactionNo: 'FT-2026-0018', transactionType: 'INTERNAL_TRANSFER', tradeDate: '2026-11-20', accountId: 'acct-cash', direction: 'IN', amount: '10000.00', counterparty: '示例银行账户', sourceDocType: 'INTERNAL_TRANSFER', sourceDocId: 'tg-001', transferGroupId: 'tg-001', status: 'RECORDED', remark: '内部转账演示（成对流水）', createdAt: '2026-11-20T11:00:00' },
  { id: 'txn-019', transactionNo: 'FT-2026-0019', transactionType: 'PROCESSING_FEE_RECEIPT', tradeDate: '2026-11-22', accountId: 'acct-bank', direction: 'IN', amount: '12345.66', counterparty: '示例客户 D', sourceDocType: 'RECEIPT', sourceDocId: 'rc-007', transferGroupId: null, status: 'RECORDED', remark: null, createdAt: '2026-11-22T10:00:00' },
  { id: 'txn-020', transactionNo: 'FT-2026-0020', transactionType: 'PURCHASE', tradeDate: '2026-11-25', accountId: 'acct-bank', direction: 'OUT', amount: '500.00', counterparty: '示例供应商乙', sourceDocType: 'PURCHASE', sourceDocId: 'po-003', transferGroupId: null, status: 'VOIDED', remark: '录入错误已作废（演示，不参与余额重算）', createdAt: '2026-11-25T09:00:00' },
  { id: 'txn-021', transactionNo: 'FT-2026-0021', transactionType: 'OTHER', tradeDate: '2026-11-26', accountId: 'acct-cash', direction: 'OUT', amount: '300.00', counterparty: null, sourceDocType: null, sourceDocId: null, transferGroupId: null, status: 'RECORDED', remark: '手工录入其他支出演示', createdAt: '2026-11-26T16:00:00' },
  { id: 'txn-022', transactionNo: 'FT-2026-0022', transactionType: 'SALARY', tradeDate: '2026-11-30', accountId: 'acct-bank', direction: 'OUT', amount: '29500.00', counterparty: null, sourceDocType: 'PAYROLL', sourceDocId: 'payroll-2026-11', transferGroupId: null, status: 'RECORDED', remark: '11 月工资演示', createdAt: '2026-11-30T17:00:00' },
]

/**
 * 构造全新初始状态（每次调用返回独立副本）。
 * 页面刷新 / Store 重建 / resetDemoData() 一律经此恢复，保证跨模块验证场景可重复。
 */
export function createInitialPrototypeState(): PrototypeState {
  return {
    customers: DEMO_CUSTOMERS.map((item) => ({ ...item })),
    fundAccounts: DEMO_FUND_ACCOUNTS.map((item) => ({ ...item })),
    fundTransactions: DEMO_FUND_TRANSACTIONS.map((item) => ({ ...item })),
    receivables: DEMO_RECEIVABLES.map((item) => ({ ...item })),
    receipts: DEMO_RECEIPTS.map((item) => ({ ...item })),
    receiptAllocations: DEMO_RECEIPT_ALLOCATIONS.map((item) => ({ ...item })),
    idempotencyRecords: {},
  }
}
