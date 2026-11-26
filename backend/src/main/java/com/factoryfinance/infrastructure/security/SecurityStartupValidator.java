package com.factoryfinance.infrastructure.security;

import org.springframework.beans.factory.InitializingBean;
import org.springframework.context.annotation.Profile;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.stereotype.Component;

import java.util.Set;

/**
 * 安全启动校验：非开发环境禁止使用已知占位 Secret。
 *
 * <p>dev / test 环境允许使用占位 JWT 密钥便于本地起步；
 * 其他环境（如 docker）必须通过环境变量 {@code JWT_SECRET} 注入真实密钥，
 * 启动时发现占位 Secret 直接失败，禁止带占位密钥上线。</p>
 */
@Component
public class SecurityStartupValidator implements InitializingBean {

    /** 已知占位 Secret（.env.example / application-dev.yml 中的值） */
    static final Set<String> PLACEHOLDER_SECRETS = Set.of(
            "dev-only-jwt-secret-not-for-production-0123456789abcdef",
            "change_to_a_long_random_secret_at_least_32_bytes");

    private static final String[] PLACEHOLDER_PREFIXES = {"dev-only-", "change_"};

    private final JwtProperties jwtProperties;
    private final Environment environment;

    public SecurityStartupValidator(JwtProperties jwtProperties, Environment environment) {
        this.jwtProperties = jwtProperties;
        this.environment = environment;
    }

    @Override
    public void afterPropertiesSet() {
        if (environment.acceptsProfiles(Profiles.of("dev", "test"))) {
            return;
        }
        String secret = jwtProperties.getSecret() == null ? "" : jwtProperties.getSecret();
        boolean isPlaceholder = PLACEHOLDER_SECRETS.contains(secret);
        if (!isPlaceholder) {
            for (String prefix : PLACEHOLDER_PREFIXES) {
                if (secret.startsWith(prefix)) {
                    isPlaceholder = true;
                    break;
                }
            }
        }
        if (isPlaceholder) {
            throw new IllegalStateException(
                    "非开发环境禁止使用占位 JWT Secret，请通过环境变量 JWT_SECRET 注入真实密钥（至少 32 字节）");
        }
    }
}
