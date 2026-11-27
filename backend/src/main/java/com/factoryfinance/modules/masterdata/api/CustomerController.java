package com.factoryfinance.modules.masterdata.api;

import com.factoryfinance.common.api.ApiResponse;
import com.factoryfinance.common.api.PageQuery;
import com.factoryfinance.common.api.PageResult;
import com.factoryfinance.modules.masterdata.api.dto.CustomerCreateRequest;
import com.factoryfinance.modules.masterdata.api.dto.CustomerResponse;
import com.factoryfinance.modules.masterdata.api.dto.CustomerUpdateRequest;
import com.factoryfinance.modules.masterdata.application.CustomerService;
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
 * 客户管理接口（/api/v1/masterdata/customers，API_CONTRACT §10）。
 *
 * <p>需 Bearer 认证；业务编号服务端生成（CUS-0001 递增）且唯一；
 * 不提供删除（被引用保护），停用即保留。</p>
 */
@RestController
@RequestMapping("/api/v1/masterdata/customers")
@Tag(name = "客户管理", description = "客户基础资料（编号唯一；不提供删除，停用即保留）")
public class CustomerController {

    private final CustomerService customerService;

    public CustomerController(CustomerService customerService) {
        this.customerService = customerService;
    }

    @GetMapping
    @Operation(summary = "客户列表", description = "分页查询，支持关键字（名称/编号/联系方式）与状态筛选")
    public ApiResponse<PageResult<CustomerResponse>> list(
            @Valid PageQuery pageQuery,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String status) {
        return ApiResponse.success(customerService.list(keyword, status, pageQuery));
    }

    @PostMapping
    @Operation(summary = "新增客户", description = "缺省自动生成 CUS-0001 递增编号；显式编号重复返回 409")
    public ApiResponse<CustomerResponse> create(@Valid @RequestBody CustomerCreateRequest request) {
        return ApiResponse.success(customerService.create(request));
    }

    @PutMapping("/{id}")
    @Operation(summary = "更新客户", description = "更新资料或启停用；业务编号不可变")
    public ApiResponse<CustomerResponse> update(@PathVariable("id") Long id,
                                                @Valid @RequestBody CustomerUpdateRequest request) {
        return ApiResponse.success(customerService.update(id, request));
    }
}
