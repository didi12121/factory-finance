package com.factoryfinance.modules.identity.api.dto;

/**
 * 令牌响应（接口设计占位，Phase 1 实现）。
 *
 * @param accessToken 访问令牌
 * @param tokenType   令牌类型，固定 Bearer
 * @param expiresAt   过期时间（Epoch 秒）
 */
public record TokenResponse(String accessToken, String tokenType, long expiresAt) {

    public static TokenResponse bearer(String accessToken, long expiresAt) {
        return new TokenResponse(accessToken, "Bearer", expiresAt);
    }
}
