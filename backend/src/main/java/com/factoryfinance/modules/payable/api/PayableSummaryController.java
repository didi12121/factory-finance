package com.factoryfinance.modules.payable.api;

import com.factoryfinance.common.api.ApiResponse;
import com.factoryfinance.common.money.Money;
import com.factoryfinance.infrastructure.time.BusinessTime;
import com.factoryfinance.modules.payable.api.dto.PayableBalanceView;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;

/**
 * 应付余额统计 API（/api/v1/payable/summary）。
 */
@Tag(name = "应付余额", description = "应付余额/逾期应付")
@RestController
@RequestMapping("/api/v1/payable/summary")
public class PayableSummaryController {

    private final PayableReportingApi reportingApi;
    private final BusinessTime businessTime;

    public PayableSummaryController(PayableReportingApi reportingApi, BusinessTime businessTime) {
        this.reportingApi = reportingApi;
        this.businessTime = businessTime;
    }

    @GetMapping
    @Operation(summary = "应付余额统计", description = "截至当前业务日期")
    public ApiResponse<PayableBalanceView> summary() {
        LocalDate asOf = businessTime.today();
        PayableReportingApi.PayableBalance balance = reportingApi.payableBalance(asOf);
        return ApiResponse.success(new PayableBalanceView(
                Money.str(balance.outstanding()),
                Money.str(balance.overdueOutstanding()),
                asOf.toString()));
    }
}
