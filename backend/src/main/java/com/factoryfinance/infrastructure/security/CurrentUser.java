package com.factoryfinance.infrastructure.security;

/**
 * 当前操作用户（审计字段填充与业务归属）。
 * 由 {@link JwtAuthenticationFilter} 在认证成功后写入 SecurityContext。
 */
public record CurrentUser(String username, String displayName) {

    public static final String SYSTEM = "system";

    /** 未认证上下文（仅允许出现在非业务路径） */
    public static CurrentUser system() {
        return new CurrentUser(SYSTEM, "system");
    }
}
