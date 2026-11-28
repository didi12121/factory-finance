package com.factoryfinance.modules.receivable.api.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.util.List;

/**
 * 核销方案预览 / 自动分配请求（不落库、不产生流水）。
 */
public record AllocationPreviewRequest(
        @NotNull(message = "客户 id 必填") Long customerId,
        @NotBlank(message = "实际收款金额必填") String actualAmount,
        @Valid List<ReceiptAllocationRequest> allocations) {
}
