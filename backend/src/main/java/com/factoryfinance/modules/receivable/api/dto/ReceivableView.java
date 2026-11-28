package com.factoryfinance.modules.receivable.api.dto;

/**
 * 应收单视图（含派生统计：已收/未收/回款状态/逾期均来自有效核销明细）。
 *
 * @param originalAmount    原始应收金额（保留业务事实）
 * @param paidAmount        已核销金额（Σ ACTIVE 核销明细）
 * @param outstandingAmount 未收余额（= 原始应收 − 已核销，恒 ≥ 0）
 * @param paymentStatus     回款状态：UNPAID / PARTIALLY_PAID / SETTLED
 * @param overdue           是否逾期（独立属性：dueDate 非空且基准日 &gt; dueDate 且未结清）
 * @param status            单据状态：CONFIRMED / VOIDED
 */
public record ReceivableView(
        Long id,
        String statementNo,
        Long customerId,
        String customerName,
        String accountingMonth,
        String statementDate,
        String dueDate,
        String originalAmount,
        String paidAmount,
        String outstandingAmount,
        String paymentStatus,
        boolean overdue,
        String status,
        String remark,
        Long voidRecordId,
        String voidNo,
        String voidDate,
        String createdAt,
        String createdBy) {
}
