package com.factoryfinance.modules.receivable.api.dto;

/**
 * 应收余额统计（真实数据库派生；逾期以服务端业务日期为基准）。
 *
 * @param outstanding        应收余额（Σ 已确认应收单未收金额）
 * @param overdueOutstanding 逾期未收余额
 * @param confirmedTotal     已确认应收单原始金额合计（权责发生制收入口径，≠ 实际回款）
 */
public record ReceivableBalanceView(
        String outstanding,
        String overdueOutstanding,
        String confirmedTotal,
        String asOf) {
}
