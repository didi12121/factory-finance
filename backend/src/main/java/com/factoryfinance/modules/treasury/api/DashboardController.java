package com.factoryfinance.modules.treasury.api;

import com.factoryfinance.common.api.ApiResponse;
import com.factoryfinance.modules.treasury.api.dto.DashboardSummary;
import com.factoryfinance.modules.treasury.application.DashboardService;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 经营概览 API：GET /api/v1/treasury/dashboard/summary?from&to（口径分离，见 calibers）。
 */
@Tag(name = "经营概览", description = "资金余额、出资/支出/资金收付趋势统计（口径分离）")
@RestController
@RequestMapping("/api/v1/treasury/dashboard")
public class DashboardController {

    private final DashboardService dashboardService;

    public DashboardController(DashboardService dashboardService) {
        this.dashboardService = dashboardService;
    }

    @GetMapping("/summary")
    public ApiResponse<DashboardSummary> summary(
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to) {
        return ApiResponse.success(dashboardService.summary(from, to));
    }
}
