package com.factoryfinance.modules.treasury.api.dto;

import jakarta.validation.constraints.NotNull;

/**
 * 更新资金账户（局部更新；accountNo 不可变）。
 * 期初余额/期初日期仅在账户尚无资金流水时允许修改。
 */
public record UpdateAccountRequest(
        @NotNull(message = "账户 id 必填") Long id,
        String name,
        String accountType,
        String openingBalance,
        String openingDate,
        String status,
        String remark) {
}
