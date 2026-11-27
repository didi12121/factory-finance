package com.factoryfinance.modules.identity.api.dto;

/**
 * 令牌响应（API_CONTRACT §8.1 / §10）。
 *
 * @param accessToken 访问令牌（HS256，claims: sub=username, name=displayName）
 * @param tokenType   令牌类型，固定 Bearer
 * @param expiresAt   过期时间（Epoch 秒）
 * @param user        登录用户信息
 */
public record TokenResponse(String accessToken, String tokenType, long expiresAt, LoginUserResponse user) {

    public static TokenResponse bearer(String accessToken, long expiresAt, LoginUserResponse user) {
        return new TokenResponse(accessToken, "Bearer", expiresAt, user);
    }
}
