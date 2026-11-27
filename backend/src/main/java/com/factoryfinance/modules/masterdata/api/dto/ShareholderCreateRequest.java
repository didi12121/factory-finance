package com.factoryfinance.modules.masterdata.api.dto;

import com.factoryfinance.modules.masterdata.domain.MasterdataConstants;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * 股东新增请求。
 *
 * @param shareholderNo 业务编号（可选；缺省按 SH-0001 递增规则生成；显式指定须唯一，重复返回 409）
 * @param name          名称（必填）
 * @param contact       联系方式（可选）
 * @param remark        备注（可选）
 */
public record ShareholderCreateRequest(
        @Pattern(regexp = MasterdataConstants.SHAREHOLDER_NO_OPTIONAL_REGEX,
                message = "股东编号格式须为 SH-0001 形式")
        String shareholderNo,

        @NotBlank(message = "名称不能为空")
        @Size(max = MasterdataConstants.NAME_MAX, message = "名称长度不能超过 128")
        String name,

        @Size(max = MasterdataConstants.CONTACT_MAX, message = "联系方式长度不能超过 128")
        String contact,

        @Size(max = MasterdataConstants.REMARK_MAX, message = "备注长度不能超过 500")
        String remark) {
}
