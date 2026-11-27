package com.factoryfinance.modules.treasury.application;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.factoryfinance.infrastructure.time.BusinessTime;
import com.factoryfinance.modules.treasury.api.dto.DashboardSummary;
import com.factoryfinance.modules.treasury.api.dto.TransactionView;
import com.factoryfinance.modules.treasury.api.dto.TrendPoint;
import com.factoryfinance.modules.treasury.domain.FundTransaction;
import com.factoryfinance.modules.treasury.infrastructure.mapper.ExpenseMapper;
import com.factoryfinance.modules.treasury.infrastructure.mapper.FundAccountMapper;
import com.factoryfinance.modules.treasury.infrastructure.mapper.FundTransactionMapper;
import com.factoryfinance.modules.treasury.infrastructure.mapper.ShareholderContributionMapper;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 经营概览统计（口径分离，禁止虚假财务数据）：
 * <ul>
 *   <li>当前资金余额 = 全部账户期初余额 + 全部 RECORDED 流水重算合计（非缓存）</li>
 *   <li>期间股东出资 = 出资单 CONFIRMED 合计（不计营业收入）</li>
 *   <li>期间实际支出 = 支出单 CONFIRMED 合计（"资金支出"口径，非会计费用）</li>
 *   <li>期间资金流入/流出 = 外部 IN/OUT 流水（含股东出资；不含内部转账与撤销更正）</li>
 *   <li>趋势 = 按日外部收付（不含内部转账；撤销反向流水按撤销日展示为更正）</li>
 * </ul>
 * 暂无数据的应收/营业收入区域不属本模块范围，不输出占位假数据。
 */
@Service
public class DashboardService {

    private static final DateTimeFormatter ISO_DATE = DateTimeFormatter.ISO_LOCAL_DATE;
    private static final int TREND_MAX_DAYS = 366;
    private static final int RECENT_LIMIT = 8;

    private final FundAccountMapper accountMapper;
    private final FundTransactionMapper transactionMapper;
    private final ShareholderContributionMapper contributionMapper;
    private final ExpenseMapper expenseMapper;
    private final TransactionQueryService transactionQueryService;
    private final BusinessTime businessTime;

    public DashboardService(FundAccountMapper accountMapper,
                            FundTransactionMapper transactionMapper,
                            ShareholderContributionMapper contributionMapper,
                            ExpenseMapper expenseMapper,
                            TransactionQueryService transactionQueryService,
                            BusinessTime businessTime) {
        this.accountMapper = accountMapper;
        this.transactionMapper = transactionMapper;
        this.contributionMapper = contributionMapper;
        this.expenseMapper = expenseMapper;
        this.transactionQueryService = transactionQueryService;
        this.businessTime = businessTime;
    }

    public DashboardSummary summary(String fromRaw, String toRaw) {
        LocalDate to = toRaw == null || toRaw.isBlank()
                ? businessTime.today()
                : TreasuryValidation.parseDate(toRaw, "to");
        LocalDate from = fromRaw == null || fromRaw.isBlank()
                ? to.minusDays(29)
                : TreasuryValidation.parseDate(fromRaw, "from");
        TreasuryValidation.requireNotAfterToday(businessTime, to, "to");
        if (from.isAfter(to)) {
            throw TreasuryValidation.invalid("from", "起始日期不能晚于结束日期");
        }
        if (from.plusDays(TREND_MAX_DAYS).isBefore(to)) {
            throw TreasuryValidation.invalid("from", "查询区间不能超过 " + TREND_MAX_DAYS + " 天");
        }

        // 当前资金余额：期初合计 + 全部 RECORDED 流水净额（重算，非缓存）
        BigDecimal currentBalance = accountMapper.selectTotalOpeningBalance();
        for (FundTransactionMapper.AccountNet net : transactionMapper.selectNetByAccount()) {
            currentBalance = currentBalance.add(net.net());
        }

        BigDecimal contributionTotal = contributionMapper.selectConfirmedSum(from, to);
        BigDecimal expenseTotal = expenseMapper.selectConfirmedSum(from, to);
        FundTransactionMapper.ExternalFlow external = transactionMapper.selectExternalFlow(from, to);

        List<TrendPoint> trend = buildTrend(from, to);
        List<TransactionView> recent = transactionQueryService.toViews(
                transactionMapper.selectList(new QueryWrapper<FundTransaction>()
                        .orderByDesc("trade_date")
                        .orderByDesc("id")
                        .last("LIMIT " + RECENT_LIMIT)));

        Map<String, String> calibers = new LinkedHashMap<>();
        calibers.put("currentBalance", "当前资金余额：全部资金账户期初余额 + 有效资金流水重算合计（不含缓存列）");
        calibers.put("periodContributionTotal", "期间股东出资：出资单 CONFIRMED 合计（股东出资，不计营业收入）");
        calibers.put("periodExpenseTotal", "资金支出：支出单 CONFIRMED 合计（已实际支付；资金支出 ≠ 会计费用）");
        calibers.put("periodExternalInflow", "期间资金流入：外部 IN 流水（含股东出资；不含内部转账与撤销更正）");
        calibers.put("periodExternalOutflow", "期间资金流出：外部 OUT 流水（不含内部转账与撤销更正）");
        calibers.put("trend", "资金收付趋势：按日外部收付（不含内部转账；撤销反向流水按撤销日展示为更正）");

        return new DashboardSummary(
                ISO_DATE.format(from),
                ISO_DATE.format(to),
                Money.str(currentBalance),
                Money.str(contributionTotal),
                Money.str(expenseTotal),
                Money.str(external.inflow()),
                Money.str(external.outflow()),
                calibers,
                trend,
                recent);
    }

    private List<TrendPoint> buildTrend(LocalDate from, LocalDate to) {
        Map<LocalDate, FundTransactionMapper.DailyFlow> byDate = new LinkedHashMap<>();
        transactionMapper.selectDailyFlow(from, to)
                .forEach(f -> byDate.put(f.tradeDate(), f));
        List<TrendPoint> points = new ArrayList<>();
        for (LocalDate day = from; !day.isAfter(to); day = day.plusDays(1)) {
            FundTransactionMapper.DailyFlow flow = byDate.get(day);
            points.add(new TrendPoint(
                    ISO_DATE.format(day),
                    Money.str(flow == null ? BigDecimal.ZERO : flow.inflow()),
                    Money.str(flow == null ? BigDecimal.ZERO : flow.outflow()),
                    Money.str(flow == null ? BigDecimal.ZERO : flow.correctionIn()),
                    Money.str(flow == null ? BigDecimal.ZERO : flow.correctionOut())));
        }
        return points;
    }
}
