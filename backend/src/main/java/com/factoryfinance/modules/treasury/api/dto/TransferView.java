package com.factoryfinance.modules.treasury.api.dto;

/**
 * 内部转账单视图（含撤销关联，已撤销可查询追溯）。
 */
public record TransferView(
        Long id,
        String docNo,
        String transferDate,
        Long fromAccountId,
        String fromAccountName,
        Long toAccountId,
        String toAccountName,
        String amount,
        String remark,
        String status,
        Long voidRecordId,
        String voidNo,
        String voidDate,
        String createdAt,
        String createdBy) {
}
