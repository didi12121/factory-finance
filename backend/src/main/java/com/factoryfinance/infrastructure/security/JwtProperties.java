package com.factoryfinance.infrastructure.security;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

/**
 * JWT 基础配置。
 *
 * <p>签名密钥通过环境变量 {@code JWT_SECRET} 注入，禁止将真实密钥提交到代码仓库。
 * JWT 的签发与生命周期管理（登录、刷新、吊销）属于 Phase 1 范围。</p>
 */
@ConfigurationProperties(prefix = "app.security.jwt")
public class JwtProperties {

    /** HMAC 签名密钥，至少 32 字节 */
    private String secret;

    /** 签发者 */
    private String issuer = "factory-finance";

    /** 令牌有效期 */
    private Duration ttl = Duration.ofHours(2);

    public String getSecret() {
        return secret;
    }

    public void setSecret(String secret) {
        this.secret = secret;
    }

    public String getIssuer() {
        return issuer;
    }

    public void setIssuer(String issuer) {
        this.issuer = issuer;
    }

    public Duration getTtl() {
        return ttl;
    }

    public void setTtl(Duration ttl) {
        this.ttl = ttl;
    }
}
