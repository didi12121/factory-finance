package com.factoryfinance.modules.treasury.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/**
 * 确认内部转账（同事务生成 from OUT + to IN 成对流水，整体净变化 0）。
 * docNo 缺省时按 ZZ-YYYYMM-0001 确定性序列生成；重复提交由唯一键拦截 → 409。
 */
public record CreateTransferRequest(
        @NotBlank(message = "转账日期必填") String transferDate,
        @NotNull(message = "转出账户 id 必填") Long fromAccountId,
        @NotNull(message = "转入账户 id 必填") Long toAccountId,
        @NotBlank(message = "金额必填") String amount,
        String remark,
        String docNo) {
}
