package com.factoryfinance.modules.masterdata.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 新增供应商（编号缺省服务端生成 SUP-0001 递增）。
 */
public record SupplierCreateRequest(
        @Size(max = 32, message = "供应商编号长度不能超过 32") String supplierNo,
        @NotBlank(message = "供应商名称必填") @Size(max = 128, message = "供应商名称长度不能超过 128") String name,
        @Size(max = 128, message = "联系方式长度不能超过 128") String contact,
        @Size(max = 32, message = "联系电话长度不能超过 32") String phone,
        @Size(max = 500, message = "备注长度不能超过 500") String remark) {
}
