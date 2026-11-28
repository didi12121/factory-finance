package com.factoryfinance.modules.receivable.api;

import com.factoryfinance.common.api.ApiResponse;
import com.factoryfinance.common.money.Money;
import com.factoryfinance.infrastructure.time.BusinessTime;
import com.factoryfinance.modules.receivable.api.dto.ReceivableBalanceView;
import com.factoryfinance.modules.treasury.api.FundFlowPort;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;

/**
 * 应收余额统计 API（/api/v1/receivable/summary）。
 * 经营概览读取真实数据库的应收余额；营业收入与资金余额口径分离。
 */
@Tag(name = "应收余额", description = "应收余额/逾期应收/权责发生制应收合计")
@RestController
@RequestMapping("/api/v1/receivable/summary")
public class ReceivableSummaryController {

    private final ReceivableReportingApi reportingApi;
    private final FundFlowPort fundFlowPort;
    private final BusinessTime businessTime;

    public ReceivableSummaryController(ReceivableReportingApi reportingApi,
                                       FundFlowPort fundFlowPort,
                                       BusinessTime businessTime) {
        this.reportingApi = reportingApi;
        this.fundFlowPort = fundFlowPort;
        this.businessTime = businessTime;
    }

    @GetMapping
    @Operation(summary = "应收余额统计", description = "截至当前业务日期（逾期基准日）")
    public ApiResponse<ReceivableBalanceView> summary() {
        LocalDate asOf = businessTime.today();
        ReceivableReportingApi.ReceivableBalance balance = reportingApi.receivableBalance(asOf);
        return ApiResponse.success(new ReceivableBalanceView(
                Money.str(balance.outstanding()),
                Money.str(balance.overdueOutstanding()),
                Money.str(balance.confirmedTotal()),
                asOf.toString()));
    }
}
