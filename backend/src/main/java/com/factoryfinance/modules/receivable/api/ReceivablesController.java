package com.factoryfinance.modules.receivable.api;

import com.factoryfinance.common.api.ApiResponse;
import com.factoryfinance.common.api.PageResult;
import com.factoryfinance.modules.receivable.api.dto.CreateReceivableRequest;
import com.factoryfinance.modules.receivable.api.dto.ReceivableView;
import com.factoryfinance.modules.receivable.application.ReceivableService;
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
 * 应收账款 API（/api/v1/receivable/receivables）。
 *
 * <p>确认应收单只登记债权（不产生资金流水、不增加实际资金余额）；
 * 已收/未收/回款状态/逾期由有效核销明细派生；撤销可追溯且已有核销时禁止直接撤销。</p>
 */
@Tag(name = "应收账款", description = "加工费对账应收登记、查询与撤销")
@RestController
@RequestMapping("/api/v1/receivable/receivables")
public class ReceivablesController {

    private final ReceivableService receivableService;

    public ReceivablesController(ReceivableService receivableService) {
        this.receivableService = receivableService;
    }

    @GetMapping
    @Operation(summary = "应收单列表", description = "支持关键字、对账日期范围、客户、所属月份、回款状态与仅逾期筛选")
    public ApiResponse<PageResult<ReceivableView>> list(
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer size,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo,
            @RequestParam(required = false) Long customerId,
            @RequestParam(required = false) String accountingMonth,
            @RequestParam(required = false) String paymentStatus,
            @RequestParam(required = false) Boolean overdueOnly) {
        return ApiResponse.success(receivableService.list(page, size, keyword, dateFrom, dateTo,
                customerId, accountingMonth, paymentStatus, overdueOnly));
    }

    @GetMapping("/{id}")
    @Operation(summary = "应收单详情")
    public ApiResponse<ReceivableView> get(@PathVariable long id) {
        return ApiResponse.success(receivableService.get(id));
    }

    @PostMapping
    @Operation(summary = "新建应收单", description = "需幂等键；不产生资金流水；禁止未来日期/未来会计月份")
    public ApiResponse<ReceivableView> create(@Valid @RequestBody CreateReceivableRequest request) {
        return ApiResponse.success(receivableService.create(request));
    }

    @PostMapping("/{id}/void")
    @Operation(summary = "撤销应收单", description = "已有有效回款核销时拒绝；撤销保留原单据并登记可追溯撤销记录")
    public ApiResponse<VoidView> voidReceivable(@PathVariable long id,
                                                @Valid @RequestBody VoidRequest request) {
        return ApiResponse.success(receivableService.voidReceivable(id, request));
    }
}
