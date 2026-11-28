package com.factoryfinance.modules.treasury.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/**
 * 确认内部转账（同事务生成 from OUT + to IN 成对流水，整体净变化 0）。
 *
 * <p>idempotencyKey 必填：每次独立业务操作生成，重试复用同一键；
 * 同键同参不重复生成单据与流水，同键异参拒绝（409）。</p>
 */
public record CreateTransferRequest(
        @NotBlank(message = "转账日期必填") String transferDate,
        @NotNull(message = "转出账户 id 必填") Long fromAccountId,
        @NotNull(message = "转入账户 id 必填") Long toAccountId,
        @NotBlank(message = "金额必填") String amount,
        String remark,
        String docNo,
        @NotBlank(message = "幂等键必填") String idempotencyKey) {
}
