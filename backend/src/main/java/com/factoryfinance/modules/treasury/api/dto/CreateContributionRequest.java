package com.factoryfinance.modules.treasury.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/**
 * 确认股东出资（同事务生成 IN 资金流水；计入资金流入、不计营业收入）。
 *
 * <p>idempotencyKey 必填：由前端为每次独立业务操作生成，网络超时/失败重试复用同一键；
 * 同键同参不重复生成单据与流水，同键异参拒绝（409）。docNo 缺省时按 CZ-YYYYMM-0001 生成。</p>
 */
public record CreateContributionRequest(
        @NotNull(message = "股东 id 必填") Long shareholderId,
        @NotBlank(message = "出资日期必填") String contributionDate,
        @NotNull(message = "资金账户 id 必填") Long accountId,
        @NotBlank(message = "金额必填") String amount,
        String remark,
        String docNo,
        @NotBlank(message = "幂等键必填") String idempotencyKey) {
}
