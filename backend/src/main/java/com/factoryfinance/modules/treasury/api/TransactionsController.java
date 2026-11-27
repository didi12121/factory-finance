package com.factoryfinance.modules.treasury.api;

import com.factoryfinance.common.api.ApiResponse;
import com.factoryfinance.common.api.PageResult;
import com.factoryfinance.modules.treasury.api.dto.TransactionView;
import com.factoryfinance.modules.treasury.application.TransactionQueryService;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 资金流水 API：GET /api/v1/treasury/transactions（分页 + 关键字/日期/账户/类型/方向筛选）。
 */
@Tag(name = "资金流水", description = "资金流水查询与追溯")
@RestController
@RequestMapping("/api/v1/treasury/transactions")
public class TransactionsController {

    private final TransactionQueryService transactionQueryService;

    public TransactionsController(TransactionQueryService transactionQueryService) {
        this.transactionQueryService = transactionQueryService;
    }

    @GetMapping
    public ApiResponse<PageResult<TransactionView>> list(
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer size,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo,
            @RequestParam(required = false) Long accountId,
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String direction) {
        return ApiResponse.success(transactionQueryService.search(
                page, size, keyword, dateFrom, dateTo, accountId, type, direction));
    }
}
