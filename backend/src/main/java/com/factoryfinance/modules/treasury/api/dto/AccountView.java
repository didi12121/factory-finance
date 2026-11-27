package com.factoryfinance.modules.treasury.api.dto;

/**
 * 资金账户视图。currentBalance 由流水重算：期初余额 + ΣIN − ΣOUT（全部 RECORDED 流水）。
 */
public record AccountView(
        Long id,
        String accountNo,
        String name,
        String accountType,
        String openingBalance,
        String openingDate,
        String status,
        String remark,
        String currentBalance,
        String createdAt,
        String createdBy,
        String updatedAt,
        String updatedBy) {
}
