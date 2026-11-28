package com.factoryfinance.modules.receivable.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/**
 * 核销明细输入：本次将某张应收单核销多少。
 * 不变量：金额 &gt; 0；单张应收累计有效核销 ≤ 原始应收金额。
 */
public record ReceiptAllocationRequest(
        @NotNull(message = "应收单 id 必填") Long receivableId,
        @NotBlank(message = "核销金额必填") String amount) {
}
