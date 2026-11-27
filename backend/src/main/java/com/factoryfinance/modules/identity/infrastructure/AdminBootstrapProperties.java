package com.factoryfinance.modules.identity.infrastructure;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 管理员初始化配置。
 *
 * <p>初始密码取环境变量 {@code ADMIN_INITIAL_PASSWORD}（配置项
 * {@code app.security.admin.initial-password}）；dev/test 环境在
 * {@code application-dev.yml} 提供明确的 dev-only 默认值。
 * 非 dev/test 环境禁止占位或空值，由 {@code SecurityStartupValidator} 启动校验。</p>
 */
@ConfigurationProperties(prefix = "app.security.admin")
public class AdminBootstrapProperties {

    /** 管理员初始密码（环境变量 ADMIN_INITIAL_PASSWORD） */
    private String initialPassword;

    public String getInitialPassword() {
        return initialPassword;
    }

    public void setInitialPassword(String initialPassword) {
        this.initialPassword = initialPassword;
    }
}
