package com.factoryfinance.modules.receivable.api.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.util.List;

/**
 * 确认加工费回款（客户实际到账事实）。
 *
 * <p>本阶段采用全额核销限制：Σ核销金额必须等于实际收款金额；
 * 未分配收款与预收款业务暂不实现（拒绝并提示用户）。</p>
 */
public record CreateReceiptRequest(
        @NotNull(message = "客户 id 必填") Long customerId,
        @NotBlank(message = "实际到账日期必填") String receiptDate,
        @NotNull(message = "收款账户 id 必填") Long accountId,
        @NotBlank(message = "实际收款金额必填") String actualAmount,
        String externalRef,
        String remark,
        @NotEmpty(message = "至少需要一条核销明细（本阶段不支持未分配收款）")
        @Valid List<ReceiptAllocationRequest> allocations,
        @NotBlank(message = "幂等键必填") String idempotencyKey) {
}
