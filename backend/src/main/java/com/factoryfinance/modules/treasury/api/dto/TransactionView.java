package com.factoryfinance.modules.treasury.api.dto;

/**
 * 资金流水视图：含 source 单据类型/编号与撤销关联（voidNo/voidDate）。
 * 原流水保留业务事实；撤销反向流水 sourceDocType=VOID，按撤销日入账为更正。
 */
public record TransactionView(
        Long id,
        String transactionNo,
        String transactionType,
        String tradeDate,
        Long accountId,
        String accountName,
        String direction,
        String amount,
        String counterparty,
        String sourceDocType,
        Long sourceDocId,
        String sourceDocNo,
        String transferGroupId,
        String status,
        String remark,
        Long voidRecordId,
        String voidNo,
        String voidDate,
        String voidReason,
        String createdAt,
        String createdBy) {
}
