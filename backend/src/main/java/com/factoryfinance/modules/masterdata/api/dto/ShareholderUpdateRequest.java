package com.factoryfinance.modules.masterdata.api.dto;

import com.factoryfinance.modules.masterdata.domain.MasterdataConstants;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * 股东更新请求（业务编号不可变；不提供删除，停用即保留）。
 *
 * @param name    名称（必填）
 * @param contact 联系方式（可选；null/空串表示清空）
 * @param remark  备注（可选；null/空串表示清空）
 * @param status  状态（可选；ENABLED/DISABLED，缺省保持不变）
 */
public record ShareholderUpdateRequest(
        @NotBlank(message = "名称不能为空")
        @Size(max = MasterdataConstants.NAME_MAX, message = "名称长度不能超过 128")
        String name,

        @Size(max = MasterdataConstants.CONTACT_MAX, message = "联系方式长度不能超过 128")
        String contact,

        @Size(max = MasterdataConstants.REMARK_MAX, message = "备注长度不能超过 500")
        String remark,

        @Pattern(regexp = MasterdataConstants.STATUS_PATTERN, message = "状态只能是 ENABLED 或 DISABLED")
        String status) {
}
