package com.factoryfinance.modules.payable.api;

import com.factoryfinance.common.api.ApiResponse;
import com.factoryfinance.common.api.PageResult;
import com.factoryfinance.modules.payable.api.dto.CreatePaymentRequest;
import com.factoryfinance.modules.payable.api.dto.PayableAllocationPreviewRequest;
import com.factoryfinance.modules.payable.api.dto.PayableAllocationPreviewView;
import com.factoryfinance.modules.payable.api.dto.PaymentView;
import com.factoryfinance.modules.payable.application.PaymentService;
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

import java.util.List;

/**
 * 应付付款 API（/api/v1/payable/payments）。
 *
 * <p>确认付款同事务创建付款单 + 资金流出流水 + 核销明细；支持部分付款与多单核销；
 * 本阶段不支持未分配付款与预付款。</p>
 */
@Tag(name = "应付付款", description = "付款登记、核销预览/校验与撤销")
@RestController
@RequestMapping("/api/v1/payable/payments")
public class PaymentsController {

    private final PaymentService paymentService;

    public PaymentsController(PaymentService paymentService) {
        this.paymentService = paymentService;
    }

    @GetMapping
    @Operation(summary = "付款单列表")
    public ApiResponse<PageResult<PaymentView>> list(
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer size,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo,
            @RequestParam(required = false) Long supplierId,
            @RequestParam(required = false) Long accountId) {
        return ApiResponse.success(paymentService.list(page, size, keyword, dateFrom, dateTo,
                supplierId, accountId));
    }

    @GetMapping("/{id}")
    @Operation(summary = "付款单详情（含核销明细）")
    public ApiResponse<PaymentView> get(@PathVariable long id) {
        return ApiResponse.success(paymentService.get(id));
    }

    @PostMapping
    @Operation(summary = "确认付款", description = "需幂等键；付款单 + 资金流出 + 核销明细同事务提交")
    public ApiResponse<PaymentView> create(@Valid @RequestBody CreatePaymentRequest request) {
        return ApiResponse.success(paymentService.create(request));
    }

    @PostMapping("/preview")
    @Operation(summary = "付款核销预览", description = "不落库、不产生流水")
    public ApiResponse<PayableAllocationPreviewView> preview(
            @Valid @RequestBody PayableAllocationPreviewRequest request) {
        return ApiResponse.success(paymentService.preview(request));
    }

    @PostMapping("/validate")
    @Operation(summary = "确认前校验", description = "返回错误列表，空数组表示可确认")
    public ApiResponse<List<PayableAllocationPreviewView.BusinessErrorView>> validate(
            @Valid @RequestBody CreatePaymentRequest request) {
        return ApiResponse.success(paymentService.validate(request));
    }

    @PostMapping("/{id}/void")
    @Operation(summary = "撤销付款单", description = "保留原单据与核销明细；反向流水冲回资金；核销明细置 REVERSED")
    public ApiResponse<VoidView> voidPayment(@PathVariable long id, @Valid @RequestBody VoidRequest request) {
        return ApiResponse.success(paymentService.voidPayment(id, request));
    }
}
