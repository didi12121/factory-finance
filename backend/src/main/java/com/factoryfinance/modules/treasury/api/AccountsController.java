package com.factoryfinance.modules.treasury.api;

import com.factoryfinance.common.api.ApiResponse;
import com.factoryfinance.common.api.PageResult;
import com.factoryfinance.modules.treasury.api.dto.AccountView;
import com.factoryfinance.modules.treasury.api.dto.CreateAccountRequest;
import com.factoryfinance.modules.treasury.api.dto.UpdateAccountRequest;
import com.factoryfinance.modules.treasury.application.AccountService;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 资金账户 API：GET/POST/PUT /api/v1/treasury/accounts（余额由流水重算）。
 */
@Tag(name = "资金账户", description = "资金账户管理与余额重算")
@RestController
@RequestMapping("/api/v1/treasury/accounts")
public class AccountsController {

    private final AccountService accountService;

    public AccountsController(AccountService accountService) {
        this.accountService = accountService;
    }

    @GetMapping
    public ApiResponse<PageResult<AccountView>> list(
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer size) {
        return ApiResponse.success(accountService.list(page, size));
    }

    @PostMapping
    public ApiResponse<AccountView> create(@Valid @RequestBody CreateAccountRequest request) {
        return ApiResponse.success(accountService.create(request));
    }

    @PutMapping
    public ApiResponse<AccountView> update(@Valid @RequestBody UpdateAccountRequest request) {
        return ApiResponse.success(accountService.update(request));
    }
}
