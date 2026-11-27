package com.factoryfinance.modules.identity.api.dto;

/**
 * 登录成功的用户信息。
 *
 * @param username    用户名
 * @param displayName 显示名
 */
public record LoginUserResponse(String username, String displayName) {
}
