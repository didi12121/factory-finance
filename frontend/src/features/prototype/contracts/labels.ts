/**
 * Prototype Contract V1.1 —— 业务类型展示标签（**单一来源**）。
 *
 * 变更记录：V1 冻结后 QA 发现（F-002）展示标签在 dashboard 与 treasury 双份维护且文案不一致，
 * 经主 Agent（契约变更裁决人）批准在契约目录新增本展示元数据文件；两个消费方统一引用，
 * 图表短标签为显式别名（同一来源，禁止再各自定义）。
 */
import type { TransactionType } from './enums'

/** 业务类型标准展示标签（列表/详情/筛选统一使用） */
export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  PROCESSING_FEE_RECEIPT: '加工费回款',
  SHAREHOLDER_CONTRIBUTION: '股东出资',
  SALARY: '工资支出',
  UTILITIES: '水电支出',
  PURCHASE: '采购支出',
  INTERNAL_TRANSFER: '内部转账',
  OTHER: '其他',
}

/** 图表短标签（空间受限场景的显式别名，语义与标准标签一致） */
export const TRANSACTION_TYPE_CHART_LABELS: Record<TransactionType, string> = {
  PROCESSING_FEE_RECEIPT: '加工费回款',
  SHAREHOLDER_CONTRIBUTION: '股东出资',
  SALARY: '工资',
  UTILITIES: '水电',
  PURCHASE: '采购',
  INTERNAL_TRANSFER: '内部转账',
  OTHER: '其他',
}
