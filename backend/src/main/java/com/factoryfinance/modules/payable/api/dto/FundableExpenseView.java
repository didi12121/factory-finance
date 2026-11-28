package com.factoryfinance.modules.payable.api.dto;

/**
 * 可关联的已支付采购支出（供「关联已有采购支出」下拉选择）。
 *
 * @param expenseId 采购支出单主键
 * @param docNo     支出单编号（ZC-YYYYMM-0001）
 * @param amount    已支付金额（关联应付单金额必须与之相等）
 * @param payDate   实际支付日期
 */
public record FundableExpenseView(
        Long expenseId,
        String docNo,
        String amount,
        String payDate) {
}
