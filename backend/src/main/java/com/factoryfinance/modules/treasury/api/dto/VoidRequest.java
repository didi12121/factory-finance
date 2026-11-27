package com.factoryfinance.modules.treasury.api.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * 撤销请求：撤销日期不得晚于当前业务日期（BusinessTime）；原因可选。
 */
public record VoidRequest(
        @NotBlank(message = "撤销日期必填") String voidDate,
        String reason) {
}
