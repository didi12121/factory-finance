package com.factoryfinance.modules.treasury.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/**
 * 确认日常支出（仅已实际支付；同事务生成 OUT 资金流水）。
 * 资金支出 ≠ 会计费用。工资（SALARY）须带 employeeName 与 salaryMonth。
 *
 * <p>idempotencyKey 必填：每次独立业务操作生成，重试复用同一键；
 * 同键同参不重复生成单据与流水，同键异参拒绝（409）。</p>
 */
public record CreateExpenseRequest(
        @NotBlank(message = "支出分类必填") String category,
        @NotBlank(message = "支出内容必填") String content,
        String bizMonth,
        @NotBlank(message = "支付日期必填") String payDate,
        @NotNull(message = "资金账户 id 必填") Long accountId,
        @NotBlank(message = "金额必填") String amount,
        String payee,
        String employeeName,
        String salaryMonth,
        String attachmentRef,
        String remark,
        String docNo,
        @NotBlank(message = "幂等键必填") String idempotencyKey) {
}
