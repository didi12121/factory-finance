package com.factoryfinance.modules.payable.api;

import com.factoryfinance.common.api.ApiResponse;
import com.factoryfinance.common.api.PageResult;
import com.factoryfinance.modules.payable.api.dto.CreatePayableRequest;
import com.factoryfinance.modules.payable.api.dto.PayableView;
import com.factoryfinance.modules.payable.application.PayableService;
import com.factoryfinance.modules.treasury.api.dto.VoidRequest;
import com.factoryfinance.modules.treasury.api.dto.VoidView;
import io.swagger.v3.oas.annotations.Operation;
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
 * 应付账款 API（/api/v1/payable/payables）。
 *
 * <p>确认应付单不立即扣减资金；确认付款才产生资金流出并减少应付余额；
 * 已有付款核销的应付单禁止直接撤销。</p>
 */
@Tag(name = "应付账款", description = "应付单登记、查询与撤销")
@RestController
@RequestMapping("/api/v1/payable/payables")
public class PayablesController {

    private final PayableService payableService;

    public PayablesController(PayableService payableService) {
        this.payableService = payableService;
    }

    @GetMapping
    @Operation(summary = "应付单列表", description = "支持关键字、业务日期范围、供应商、月份与付款状态筛选")
    public ApiResponse<PageResult<PayableView>> list(
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer size,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo,
            @RequestParam(required = false) Long supplierId,
            @RequestParam(required = false) String accountingMonth,
            @RequestParam(required = false) String paymentStatus) {
        return ApiResponse.success(payableService.list(page, size, keyword, dateFrom, dateTo,
                supplierId, accountingMonth, paymentStatus));
    }

    @GetMapping("/{id}")
    @Operation(summary = "应付单详情")
    public ApiResponse<PayableView> get(@PathVariable long id) {
        return ApiResponse.success(payableService.get(id));
    }

    @PostMapping
    @Operation(summary = "新建应付单", description = "需幂等键；不立即扣减资金")
    public ApiResponse<PayableView> create(@Valid @RequestBody CreatePayableRequest request) {
        return ApiResponse.success(payableService.create(request));
    }

    @PostMapping("/{id}/void")
    @Operation(summary = "撤销应付单", description = "已有付款核销时拒绝；撤销保留原单据并登记可追溯撤销记录")
    public ApiResponse<VoidView> voidPayable(@PathVariable long id, @Valid @RequestBody VoidRequest request) {
        return ApiResponse.success(payableService.voidPayable(id, request));
    }
}
