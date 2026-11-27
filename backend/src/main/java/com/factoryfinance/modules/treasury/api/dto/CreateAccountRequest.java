package com.factoryfinance.modules.treasury.api.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * 新增资金账户。accountNo 缺省时由服务端按确定性序列生成（ACC-0001 起）。
 */
public record CreateAccountRequest(
        String accountNo,
        @NotBlank(message = "账户名称必填") String name,
        @NotBlank(message = "账户类型必填") String accountType,
        @NotBlank(message = "期初余额必填") String openingBalance,
        @NotBlank(message = "期初日期必填") String openingDate,
        String status,
        String remark) {
}
