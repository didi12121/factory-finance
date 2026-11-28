package com.factoryfinance.modules.receivable.api;

import com.factoryfinance.common.api.ApiResponse;
import com.factoryfinance.common.api.PageResult;
import com.factoryfinance.modules.receivable.api.dto.AllocationPreviewRequest;
import com.factoryfinance.modules.receivable.api.dto.AllocationPreviewView;
import com.factoryfinance.modules.receivable.api.dto.CreateReceiptRequest;
import com.factoryfinance.modules.receivable.api.dto.ReceiptView;
import com.factoryfinance.modules.receivable.application.ReceiptService;
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
 * 加工费回款 API（/api/v1/receivable/receipts）。
 *
 * <p>确认收款在同一个数据库事务内创建收款单 + 一条资金流入流水 + 核销明细；
 * 支持一笔收款核销多张应收单、一张应收单分多次回款；本阶段要求全额核销。</p>
 */
@Tag(name = "加工费回款", description = "回款登记、核销预览/自动分配、撤销")
@RestController
@RequestMapping("/api/v1/receivable/receipts")
public class ReceiptsController {

    private final ReceiptService receiptService;

    public ReceiptsController(ReceiptService receiptService) {
        this.receiptService = receiptService;
    }

    @GetMapping
    @Operation(summary = "收款单列表", description = "支持关键字、到账日期范围、客户与账户筛选")
    public ApiResponse<PageResult<ReceiptView>> list(
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer size,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo,
            @RequestParam(required = false) Long customerId,
            @RequestParam(required = false) Long accountId) {
        return ApiResponse.success(receiptService.list(page, size, keyword, dateFrom, dateTo,
                customerId, accountId));
    }

    @GetMapping("/{id}")
    @Operation(summary = "收款单详情（含核销明细）")
    public ApiResponse<ReceiptView> get(@PathVariable long id) {
        return ApiResponse.success(receiptService.get(id));
    }

    @PostMapping
    @Operation(summary = "确认收款", description = "需幂等键；收款单 + 资金流入 + 核销明细同事务提交")
    public ApiResponse<ReceiptView> create(@Valid @RequestBody CreateReceiptRequest request) {
        return ApiResponse.success(receiptService.create(request));
    }

    @PostMapping("/preview")
    @Operation(summary = "核销方案预览", description = "不落库、不产生流水")
    public ApiResponse<AllocationPreviewView> preview(@Valid @RequestBody AllocationPreviewRequest request) {
        return ApiResponse.success(receiptService.preview(request));
    }

    @PostMapping("/auto-allocate")
    @Operation(summary = "按到期日自动分配（预览）", description = "到期日最早优先；不落库")
    public ApiResponse<AllocationPreviewView> autoAllocate(@Valid @RequestBody AllocationPreviewRequest request) {
        return ApiResponse.success(receiptService.autoAllocate(request));
    }

    @PostMapping("/validate")
    @Operation(summary = "确认前校验", description = "返回错误列表，空数组表示可确认")
    public ApiResponse<List<AllocationPreviewView.BusinessErrorView>> validate(
            @Valid @RequestBody CreateReceiptRequest request) {
        return ApiResponse.success(receiptService.validate(request));
    }

    @PostMapping("/{id}/void")
    @Operation(summary = "撤销收款单", description = "保留原单据与核销明细；反向流水冲回资金；核销明细置 REVERSED")
    public ApiResponse<VoidView> voidReceipt(@PathVariable long id, @Valid @RequestBody VoidRequest request) {
        return ApiResponse.success(receiptService.voidReceipt(id, request));
    }
}
