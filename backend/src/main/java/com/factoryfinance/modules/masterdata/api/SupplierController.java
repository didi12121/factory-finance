package com.factoryfinance.modules.masterdata.api;

import com.factoryfinance.common.api.ApiResponse;
import com.factoryfinance.common.api.PageQuery;
import com.factoryfinance.common.api.PageResult;
import com.factoryfinance.modules.masterdata.api.dto.SupplierCreateRequest;
import com.factoryfinance.modules.masterdata.api.dto.SupplierResponse;
import com.factoryfinance.modules.masterdata.api.dto.SupplierUpdateRequest;
import com.factoryfinance.modules.masterdata.application.SupplierService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 供应商管理接口（/api/v1/masterdata/suppliers）。
 *
 * <p>需 Bearer 认证；编号服务端生成（SUP-0001 递增）且唯一；
 * 不提供删除（被应付单据引用保护），停用即保留。</p>
 */
@RestController
@RequestMapping("/api/v1/masterdata/suppliers")
@Tag(name = "供应商管理", description = "供应商基础资料（编号唯一；不提供删除，停用即保留）")
public class SupplierController {

    private final SupplierService supplierService;

    public SupplierController(SupplierService supplierService) {
        this.supplierService = supplierService;
    }

    @GetMapping
    @Operation(summary = "供应商列表", description = "分页查询，支持关键字（名称/编号/联系方式）与状态筛选")
    public ApiResponse<PageResult<SupplierResponse>> list(
            @Valid PageQuery pageQuery,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String status) {
        return ApiResponse.success(supplierService.list(keyword, status, pageQuery));
    }

    @PostMapping
    @Operation(summary = "新增供应商", description = "缺省自动生成 SUP-0001 递增编号；显式编号重复返回 409")
    public ApiResponse<SupplierResponse> create(@Valid @RequestBody SupplierCreateRequest request) {
        return ApiResponse.success(supplierService.create(request));
    }

    @PutMapping("/{id}")
    @Operation(summary = "更新供应商", description = "更新资料或启停用；编号不可变")
    public ApiResponse<SupplierResponse> update(@PathVariable("id") Long id,
                                                @Valid @RequestBody SupplierUpdateRequest request) {
        return ApiResponse.success(supplierService.update(id, request));
    }
}
