package com.factoryfinance.modules.treasury.api.dto;

import java.util.List;

/**
 * 撤销结果视图：保留原单据与原流水，创建反向流水纠正余额。
 * 转账撤销含两条反向流水（from IN + to OUT），reverseTransactionIds 按序返回。
 */
public record VoidView(
        Long id,
        String voidNo,
        String targetDocType,
        Long targetDocId,
        String targetDocNo,
        String voidDate,
        String reason,
        List<Long> reverseTransactionIds,
        List<String> reverseTransactionNos,
        String createdAt,
        String createdBy) {
}
