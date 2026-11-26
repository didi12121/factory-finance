package com.factoryfinance.infrastructure.security;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SecurityStartupValidatorTest {

    private static JwtProperties props(String secret) {
        JwtProperties properties = new JwtProperties();
        properties.setSecret(secret);
        return properties;
    }

    @Test
    void dev_profile_allows_placeholder_secret() {
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles("dev");

        assertThatCode(() -> new SecurityStartupValidator(
                props("dev-only-jwt-secret-not-for-production-0123456789abcdef"), environment)
                .afterPropertiesSet()).doesNotThrowAnyException();
    }

    @Test
    void non_dev_profile_rejects_known_placeholder_secret() {
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles("docker");

        assertThatThrownBy(() -> new SecurityStartupValidator(
                props("dev-only-jwt-secret-not-for-production-0123456789abcdef"), environment)
                .afterPropertiesSet())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("占位");
    }

    @Test
    void non_dev_profile_rejects_env_example_placeholder_secret() {
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles("docker");

        assertThatThrownBy(() -> new SecurityStartupValidator(
                props("change_to_a_long_random_secret_at_least_32_bytes"), environment)
                .afterPropertiesSet())
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void non_dev_profile_accepts_real_secret() {
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles("docker");

        assertThatCode(() -> new SecurityStartupValidator(
                props("a-real-production-secret-with-at-least-32-bytes"), environment)
                .afterPropertiesSet()).doesNotThrowAnyException();
    }
}
