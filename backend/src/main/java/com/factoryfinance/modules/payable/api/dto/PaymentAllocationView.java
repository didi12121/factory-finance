package com.factoryfinance.modules.payable.api.dto;

/**
 * 付款核销明细视图（ACTIVE / REVERSED）。
 */
public record PaymentAllocationView(
        Long id,
        Long paymentId,
        String paymentNo,
        Long payableId,
        String payableNo,
        String allocationAmount,
        String status,
        String allocatedAt) {
}
