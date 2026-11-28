package com.factoryfinance.modules.masterdata.api.dto;

import com.factoryfinance.modules.masterdata.domain.MasterdataConstants;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * 更新供应商（含启停用；编号不可变）。
 */
public record SupplierUpdateRequest(
        @Size(max = 128, message = "供应商名称长度不能超过 128") String name,
        @Size(max = 128, message = "联系方式长度不能超过 128") String contact,
        @Size(max = 32, message = "联系电话长度不能超过 32") String phone,
        @Size(max = 500, message = "备注长度不能超过 500") String remark,
        @Pattern(regexp = MasterdataConstants.STATUS_PATTERN, message = "状态只能是 ENABLED 或 DISABLED")
        String status) {
}
