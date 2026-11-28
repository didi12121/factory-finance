package com.factoryfinance.modules.payable.api.dto;

/**
 * 应付单视图（含派生已付/未付/状态）。
 *
 * @param paidAmount        已付金额（Σ ACTIVE 付款核销 + 已由支出单直接支付金额）
 * @param outstandingAmount 未付余额（= 应付金额 − 已付金额，恒 ≥ 0）
 * @param paymentStatus     UNPAID / PARTIALLY_PAID / SETTLED
 * @param fundedExpenseId   已由 Phase 1 采购支出直接支付的支出单 id（非空时禁止再付款）
 * @param status            单据状态：CONFIRMED / VOIDED
 */
public record PayableView(
        Long id,
        String payableNo,
        Long supplierId,
        String supplierName,
        String bizDate,
        String accountingMonth,
        String dueDate,
        String amount,
        String paidAmount,
        String outstandingAmount,
        String paymentStatus,
        String content,
        String remark,
        Long fundedExpenseId,
        String status,
        Long voidRecordId,
        String voidNo,
        String voidDate,
        String createdAt,
        String createdBy) {
}
