package com.factoryfinance.modules.importer.api.dto;

import java.util.List;

/**
 * 导入核对结果（全部读取真实业务表，不存派生值）。
 *
 * <p>口径：资金账户余额 = 期初余额 + Σ有效流入 − Σ有效流出（期初与流水分别记录，不重复计算）；
 * 应收/应付余额 = 原始金额 − 有效核销（已撤销不计）。发现差异只提示，不自动修改或清零。</p>
 */
public record ReconciliationView(
        String asOf,
        List<AccountReconciliation> accounts,
        String totalFundBalance,
        List<ReceivableReconciliation> receivables,
        String totalReceivableOutstanding,
        List<PayableReconciliation> payables,
        String totalPayableOutstanding,
        ImportStats importStats,
        List<String> warnings) {

    /** 资金账户核对行 */
    public record AccountReconciliation(String accountNo, String name, String openingBalance, String balance) {
    }

    /** 客户应收核对行 */
    public record ReceivableReconciliation(long customerId, String customerName,
                                           String outstanding, String originalTotal) {
    }

    /** 供应商应付核对行 */
    public record PayableReconciliation(long supplierId, String supplierName, String outstanding) {
    }

    /**
     * 导入统计。
     *
     * @param batches       已完成批次数
     * @param successRows   成功导入行数（累计）
     * @param failedRows    失败行数（累计）
     * @param duplicateRows 重复跳过行数（累计）
     */
    public record ImportStats(int batches, int successRows, int failedRows, int duplicateRows,
                              String latestBatchNo, String latestBatchStatus) {
    }
}
