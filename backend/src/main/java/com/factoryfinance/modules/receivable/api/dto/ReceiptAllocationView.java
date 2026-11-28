package com.factoryfinance.modules.receivable.api.dto;

/**
 * 核销明细视图（收款单 ↔ 应收单）。
 *
 * @param status ACTIVE（有效）/ REVERSED（已随收款撤销冲回，保留原事实）
 */
public record ReceiptAllocationView(
        Long id,
        Long receiptId,
        String receiptNo,
        Long receivableId,
        String statementNo,
        String allocationAmount,
        String status,
        String allocatedAt) {
}
