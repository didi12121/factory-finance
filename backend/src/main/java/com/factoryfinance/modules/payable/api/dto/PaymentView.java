package com.factoryfinance.modules.payable.api.dto;

import java.util.List;

/**
 * 付款单视图（含核销明细）。
 */
public record PaymentView(
        Long id,
        String paymentNo,
        Long supplierId,
        String supplierName,
        String paymentDate,
        Long accountId,
        String accountName,
        String amount,
        Long fundTransactionId,
        String fundTransactionNo,
        String externalRef,
        String remark,
        String status,
        Long voidRecordId,
        String voidNo,
        String voidDate,
        List<PaymentAllocationView> allocations,
        String createdAt,
        String createdBy) {
}
