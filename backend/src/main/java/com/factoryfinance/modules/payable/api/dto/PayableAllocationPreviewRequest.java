package com.factoryfinance.modules.payable.api.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.util.List;

/**
 * 付款核销预览/校验请求（不落库、不产生流水）。
 */
public record PayableAllocationPreviewRequest(
        @NotNull(message = "供应商 id 必填") Long supplierId,
        @NotBlank(message = "付款金额必填") String amount,
        @Valid List<PayableAllocationRequest> allocations) {
}
