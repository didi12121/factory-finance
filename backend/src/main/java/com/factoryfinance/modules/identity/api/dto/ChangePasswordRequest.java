package com.factoryfinance.modules.identity.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 修改密码请求。
 *
 * @param oldPassword 旧密码（必填）
 * @param newPassword 新密码（必填，至少 8 位）
 */
public record ChangePasswordRequest(
        @NotBlank(message = "旧密码不能为空")
        @Size(max = 128, message = "旧密码长度不能超过 128")
        String oldPassword,

        @NotBlank(message = "新密码不能为空")
        @Size(min = 8, max = 128, message = "新密码长度必须在 8 到 128 之间")
        String newPassword) {
}
