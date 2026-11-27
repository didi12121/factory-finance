package com.factoryfinance.modules.treasury.api;

import com.factoryfinance.common.api.ApiResponse;
import com.factoryfinance.common.api.PageResult;
import com.factoryfinance.modules.treasury.api.dto.CreateTransferRequest;
import com.factoryfinance.modules.treasury.api.dto.TransferView;
import com.factoryfinance.modules.treasury.api.dto.VoidRequest;
import com.factoryfinance.modules.treasury.api.dto.VoidView;
import com.factoryfinance.modules.treasury.application.TransferService;
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
 * 内部转账 API：GET/POST /api/v1/treasury/transfers + /{id}/void。
 * 一单两流水（from OUT + to IN），整体净变化 0，不产生收支。
 */
@Tag(name = "内部转账", description = "账户间转账与撤销")
@RestController
@RequestMapping("/api/v1/treasury/transfers")
public class TransfersController {

    private final TransferService transferService;
    private final VoidService voidService;

    public TransfersController(TransferService transferService, VoidService voidService) {
        this.transferService = transferService;
        this.voidService = voidService;
    }

    @GetMapping
    public ApiResponse<PageResult<TransferView>> list(
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer size,
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo,
            @RequestParam(required = false) Long accountId,
            @RequestParam(required = false) String status) {
        return ApiResponse.success(
                transferService.list(page, size, dateFrom, dateTo, accountId, status));
    }

    @PostMapping
    public ApiResponse<TransferView> create(@Valid @RequestBody CreateTransferRequest request) {
        return ApiResponse.success(transferService.create(request));
    }

    @PostMapping("/{id}/void")
    public ApiResponse<VoidView> voidTransfer(@PathVariable long id,
                                              @Valid @RequestBody VoidRequest request) {
        return ApiResponse.success(voidService.voidTransfer(id, request));
    }
}
