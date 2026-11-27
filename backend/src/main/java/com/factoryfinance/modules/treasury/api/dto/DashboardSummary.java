package com.factoryfinance.modules.treasury.api.dto;

import java.util.List;
import java.util.Map;

/**
 * 经营概览统计（口径分离，见 calibers 字段标注）：
 * <ul>
 *   <li>当前资金余额 = 全部账户 期初余额 + 有效流水重算合计（非缓存）</li>
 *   <li>期间股东出资 = 出资单 CONFIRMED 合计（不计营业收入）</li>
 *   <li>期间实际支出 = 支出单 CONFIRMED 合计（"资金支出"口径，非会计费用）</li>
 *   <li>期间资金流入/流出 = 外部 IN/OUT 流水（含股东出资；不含内部转账与撤销更正）</li>
 *   <li>趋势 = 按日外部收付（不含内部转账；撤销反向按撤销日展示为更正）</li>
 * </ul>
 */
public record DashboardSummary(
        String from,
        String to,
        String currentBalance,
        String periodContributionTotal,
        String periodExpenseTotal,
        String periodExternalInflow,
        String periodExternalOutflow,
        Map<String, String> calibers,
        List<TrendPoint> trend,
        List<TransactionView> recentTransactions) {
}
