package com.factoryfinance.modules.payable.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/**
 * 付款核销行输入（付款单 → 应付单）。
 */
public record PayableAllocationRequest(
        @NotNull(message = "应付单 id 必填") Long payableId,
        @NotBlank(message = "核销金额必填") String amount) {
}
