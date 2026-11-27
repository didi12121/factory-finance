package com.factoryfinance.infrastructure.security;

import org.springframework.beans.factory.InitializingBean;
import org.springframework.context.annotation.Profile;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.stereotype.Component;

import java.util.Set;

/**
 * 安全启动校验：非开发环境禁止使用已知占位 Secret 与占位/空管理员初始密码。
 *
 * <p>dev / test 环境允许使用占位 JWT 密钥与 dev-only 管理员初始密码便于本地起步；
 * 其他环境（如 docker）必须通过环境变量 {@code JWT_SECRET} 注入真实密钥、
 * 通过环境变量 {@code ADMIN_INITIAL_PASSWORD} 注入真实管理员初始密码，
 * 启动时发现占位或空值直接失败，禁止带占位配置上线。</p>
 */
@Component
public class SecurityStartupValidator implements InitializingBean {

    /** 已知占位 Secret（.env.example / application-dev.yml 中的值） */
    static final Set<String> PLACEHOLDER_SECRETS = Set.of(
            "dev-only-jwt-secret-not-for-production-0123456789abcdef",
            "change_to_a_long_random_secret_at_least_32_bytes");

    private static final String[] PLACEHOLDER_PREFIXES = {"dev-only-", "change_"};

    /** 管理员初始密码配置项（环境变量 ADMIN_INITIAL_PASSWORD） */
    static final String ADMIN_INITIAL_PASSWORD_PROPERTY = "app.security.admin.initial-password";

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
        if (isPlaceholder(secret)) {
            throw new IllegalStateException(
                    "非开发环境禁止使用占位 JWT Secret，请通过环境变量 JWT_SECRET 注入真实密钥（至少 32 字节）");
        }
        String adminInitialPassword = environment.getProperty(ADMIN_INITIAL_PASSWORD_PROPERTY);
        if (adminInitialPassword == null || adminInitialPassword.isBlank() || isPlaceholder(adminInitialPassword)) {
            throw new IllegalStateException(
                    "非开发环境禁止使用占位或空的管理员初始密码（ADMIN_INITIAL_PASSWORD），请通过环境变量注入真实初始密码");
        }
    }

    /** 占位值判定：命中已知占位值集合，或以占位前缀开头 */
    private boolean isPlaceholder(String value) {
        if (PLACEHOLDER_SECRETS.contains(value)) {
            return true;
        }
        for (String prefix : PLACEHOLDER_PREFIXES) {
            if (value.startsWith(prefix)) {
                return true;
            }
        }
        return false;
    }
}
