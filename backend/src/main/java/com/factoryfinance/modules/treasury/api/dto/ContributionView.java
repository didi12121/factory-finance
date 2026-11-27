package com.factoryfinance.modules.treasury.api.dto;

/**
 * 股东出资单视图（含撤销关联，已撤销可查询追溯）。
 */
public record ContributionView(
        Long id,
        String docNo,
        Long shareholderId,
        String shareholderName,
        String contributionDate,
        Long accountId,
        String accountName,
        String amount,
        String remark,
        String status,
        Long voidRecordId,
        String voidNo,
        String voidDate,
        String createdAt,
        String createdBy) {
}
