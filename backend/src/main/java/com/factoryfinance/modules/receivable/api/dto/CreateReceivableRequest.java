package com.factoryfinance.modules.receivable.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/**
 * 新建应收单（加工费对账单；确认后不产生资金流水、不增加实际资金余额）。
 *
 * <p>业务日期规则：statementDate 不得晚于当前业务日期；确认所属月份（accountingMonth）
 * 不得晚于当前会计月份——禁止使用未来日期或未来会计月份提前确认收入。</p>
 */
public record CreateReceivableRequest(
        @NotNull(message = "客户 id 必填") Long customerId,
        @NotBlank(message = "所属月份必填") String accountingMonth,
        @NotBlank(message = "对账日期必填") String statementDate,
        String dueDate,
        @NotBlank(message = "应收金额必填") String amount,
        String remark,
        @NotBlank(message = "幂等键必填") String idempotencyKey) {
}
