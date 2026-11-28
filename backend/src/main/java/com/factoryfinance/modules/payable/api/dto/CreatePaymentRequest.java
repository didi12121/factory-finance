package com.factoryfinance.modules.payable.api.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.util.List;

/**
 * 确认付款（对供应商实际付款；同事务生成付款单 + 资金流出流水 + 核销明细）。
 *
 * <p>本阶段不支持未分配付款与预付：Σ核销金额必须等于付款金额。
 * 应付款支持部分付款：单张应付单分多次付款、一次付款核销多张应付单。</p>
 */
public record CreatePaymentRequest(
        @NotNull(message = "供应商 id 必填") Long supplierId,
        @NotBlank(message = "实际付款日期必填") String paymentDate,
        @NotNull(message = "付款账户 id 必填") Long accountId,
        @NotBlank(message = "付款金额必填") String amount,
        String externalRef,
        String remark,
        @NotEmpty(message = "至少需要一条核销明细（本阶段不支持未分配付款）")
        @Valid List<PayableAllocationRequest> allocations,
        @NotBlank(message = "幂等键必填") String idempotencyKey) {
}
