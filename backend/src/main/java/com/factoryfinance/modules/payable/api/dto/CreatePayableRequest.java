package com.factoryfinance.modules.payable.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/**
 * 新建应付单（对供应商的债务登记）。
 *
 * <p>确认应付单<b>不立即扣减资金</b>；只有确认付款才产生资金流出。
 * fundedExpenseId 用于关联已由 Phase 1 直接登记的采购付款支出单，
 * 该应付单视为已支付，禁止再次付款（避免重复扣减资金）。</p>
 */
public record CreatePayableRequest(
        @NotNull(message = "供应商 id 必填") Long supplierId,
        @NotBlank(message = "业务日期必填") String bizDate,
        String accountingMonth,
        String dueDate,
        @NotBlank(message = "应付金额必填") String amount,
        @NotBlank(message = "业务内容必填") String content,
        String remark,
        Long fundedExpenseId,
        @NotBlank(message = "幂等键必填") String idempotencyKey) {
}
