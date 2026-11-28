package com.factoryfinance.modules.payable.api.dto;

/**
 * 应付余额统计（真实数据库派生）。
 */
public record PayableBalanceView(
        String outstanding,
        String overdueOutstanding,
        String asOf) {
}
