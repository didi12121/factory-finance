package com.factoryfinance.modules.treasury.api;

import com.factoryfinance.common.api.ApiResponse;
import com.factoryfinance.common.api.PageResult;
import com.factoryfinance.modules.treasury.api.dto.ContributionView;
import com.factoryfinance.modules.treasury.api.dto.CreateContributionRequest;
import com.factoryfinance.modules.treasury.api.dto.VoidRequest;
import com.factoryfinance.modules.treasury.api.dto.VoidView;
import com.factoryfinance.modules.treasury.application.ContributionService;
import com.factoryfinance.modules.treasury.application.VoidService;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 股东出资 API：GET/POST /api/v1/treasury/contributions + /{id}/void。
 * 确认出资同事务生成 IN 资金流水；计入资金流入、不计营业收入。
 */
@Tag(name = "股东出资", description = "股东出资确认与撤销")
@RestController
@RequestMapping("/api/v1/treasury/contributions")
public class ContributionsController {

    private final ContributionService contributionService;
    private final VoidService voidService;

    public ContributionsController(ContributionService contributionService, VoidService voidService) {
        this.contributionService = contributionService;
        this.voidService = voidService;
    }

    @GetMapping
    public ApiResponse<PageResult<ContributionView>> list(
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer size,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo,
            @RequestParam(required = false) Long shareholderId,
            @RequestParam(required = false) Long accountId,
            @RequestParam(required = false) String status) {
        return ApiResponse.success(
                contributionService.list(page, size, keyword, dateFrom, dateTo, shareholderId, accountId, status));
    }

    @PostMapping
    public ApiResponse<ContributionView> create(@Valid @RequestBody CreateContributionRequest request) {
        return ApiResponse.success(contributionService.create(request));
    }

    @PostMapping("/{id}/void")
    public ApiResponse<VoidView> voidContribution(@PathVariable long id,
                                                  @Valid @RequestBody VoidRequest request) {
        return ApiResponse.success(voidService.voidContribution(id, request));
    }
}
