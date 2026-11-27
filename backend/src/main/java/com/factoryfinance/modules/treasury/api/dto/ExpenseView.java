package com.factoryfinance.modules.treasury.api.dto;

/**
 * 支出单视图（含撤销关联，已撤销可查询追溯）。
 */
public record ExpenseView(
        Long id,
        String docNo,
        String category,
        String content,
        String bizMonth,
        String payDate,
        Long accountId,
        String accountName,
        String amount,
        String payee,
        String employeeName,
        String salaryMonth,
        String attachmentRef,
        String remark,
        String status,
        Long voidRecordId,
        String voidNo,
        String voidDate,
        String createdAt,
        String createdBy) {
}
