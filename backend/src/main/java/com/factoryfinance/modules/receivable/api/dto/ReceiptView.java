package com.factoryfinance.modules.receivable.api.dto;

import java.util.List;

/**
 * 收款单视图（含核销明细）。
 *
 * @param fundTransactionNo 对应资金流入流水编号（一笔收款只对应一条流水）
 */
public record ReceiptView(
        Long id,
        String receiptNo,
        Long customerId,
        String customerName,
        String receiptDate,
        Long accountId,
        String accountName,
        String actualAmount,
        Long fundTransactionId,
        String fundTransactionNo,
        String externalRef,
        String remark,
        String status,
        Long voidRecordId,
        String voidNo,
        String voidDate,
        List<ReceiptAllocationView> allocations,
        String createdAt,
        String createdBy) {
}
