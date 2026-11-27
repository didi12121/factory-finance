package com.factoryfinance.infrastructure.web;

import com.factoryfinance.common.web.TraceIdFilter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.Arrays;
import java.util.List;

/**
 * CORS 独立配置类。
 *
 * <p>以独立 {@link CorsConfigurationSource} Bean 提供注入；禁止全局无限制 CORS：</p>
 * <ul>
 *   <li>生产等环境：仅允许 {@code app.cors.allowed-origins} 显式配置的来源；</li>
 *   <li>dev / test 环境：额外允许本机回环来源模式（{@code http://localhost:*} /
 *       {@code http://127.0.0.1:*}）——本地开发服务器与 Playwright 预览端口均为回环地址，
 *       仅限开发/测试 profile 生效。</li>
 * </ul>
 */
@Configuration
public class CorsConfig {

    @Bean
    public CorsConfigurationSource corsConfigurationSource(
            @Value("${app.cors.allowed-origins:http://localhost:5173}") String allowedOrigins,
            Environment environment) {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(Arrays.stream(allowedOrigins.split(",")).map(String::trim).toList());
        if (environment.acceptsProfiles(Profiles.of("dev", "test"))) {
            // 本地开发/测试回环来源（端口任意）：覆盖 Vite dev/preview 与 Playwright 端口隔离
            config.setAllowedOriginPatterns(List.of("http://localhost:*", "http://127.0.0.1:*"));
        }
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        config.setExposedHeaders(List.of(TraceIdFilter.TRACE_HEADER));
        config.setMaxAge(3600L);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }
}
