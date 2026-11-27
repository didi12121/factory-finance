package com.factoryfinance.modules.treasury.api;

import com.factoryfinance.common.api.ApiResponse;
import com.factoryfinance.common.api.PageResult;
import com.factoryfinance.modules.treasury.api.dto.CreateExpenseRequest;
import com.factoryfinance.modules.treasury.api.dto.ExpenseView;
import com.factoryfinance.modules.treasury.api.dto.VoidRequest;
import com.factoryfinance.modules.treasury.api.dto.VoidView;
import com.factoryfinance.modules.treasury.application.ExpenseService;
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
 * 日常支出 API：GET/POST /api/v1/treasury/expenses + /{id}/void。
 * 仅已实际支付；资金支出 ≠ 会计费用（Dashboard 口径标注"资金支出"）。
 */
@Tag(name = "日常支出", description = "日常支出确认与撤销")
@RestController
@RequestMapping("/api/v1/treasury/expenses")
public class ExpensesController {

    private final ExpenseService expenseService;
    private final VoidService voidService;

    public ExpensesController(ExpenseService expenseService, VoidService voidService) {
        this.expenseService = expenseService;
        this.voidService = voidService;
    }

    @GetMapping
    public ApiResponse<PageResult<ExpenseView>> list(
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer size,
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) Long accountId,
            @RequestParam(required = false) String status) {
        return ApiResponse.success(
                expenseService.list(page, size, dateFrom, dateTo, category, accountId, status));
    }

    @PostMapping
    public ApiResponse<ExpenseView> create(@Valid @RequestBody CreateExpenseRequest request) {
        return ApiResponse.success(expenseService.create(request));
    }

    @PostMapping("/{id}/void")
    public ApiResponse<VoidView> voidExpense(@PathVariable long id,
                                             @Valid @RequestBody VoidRequest request) {
        return ApiResponse.success(voidService.voidExpense(id, request));
    }
}
