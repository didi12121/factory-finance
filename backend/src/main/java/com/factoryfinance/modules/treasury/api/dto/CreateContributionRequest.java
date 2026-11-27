package com.factoryfinance.modules.treasury.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/**
 * 确认股东出资（同事务生成 IN 资金流水；计入资金流入、不计营业收入）。
 * docNo 缺省时按 CZ-YYYYMM-0001 确定性序列生成；重复提交由唯一键拦截 → 409。
 */
public record CreateContributionRequest(
        @NotNull(message = "股东 id 必填") Long shareholderId,
        @NotBlank(message = "出资日期必填") String contributionDate,
        @NotNull(message = "资金账户 id 必填") Long accountId,
        @NotBlank(message = "金额必填") String amount,
        String remark,
        String docNo) {
}
