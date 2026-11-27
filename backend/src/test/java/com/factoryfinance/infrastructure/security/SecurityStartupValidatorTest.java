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

    private static MockEnvironment environmentWith(String profile, String adminInitialPassword) {
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles(profile);
        if (adminInitialPassword != null) {
            environment.setProperty("app.security.admin.initial-password", adminInitialPassword);
        }
        return environment;
    }

    @Test
    void dev_profile_allows_placeholder_secret() {
        assertThatCode(() -> new SecurityStartupValidator(
                props("dev-only-jwt-secret-not-for-production-0123456789abcdef"),
                environmentWith("dev", null))
                .afterPropertiesSet()).doesNotThrowAnyException();
    }

    @Test
    void non_dev_profile_rejects_known_placeholder_secret() {
        assertThatThrownBy(() -> new SecurityStartupValidator(
                props("dev-only-jwt-secret-not-for-production-0123456789abcdef"),
                environmentWith("docker", "real-admin-initial-password"))
                .afterPropertiesSet())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("占位");
    }

    @Test
    void non_dev_profile_rejects_env_example_placeholder_secret() {
        assertThatThrownBy(() -> new SecurityStartupValidator(
                props("change_to_a_long_random_secret_at_least_32_bytes"),
                environmentWith("docker", "real-admin-initial-password"))
                .afterPropertiesSet())
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void non_dev_profile_accepts_real_secret_and_real_admin_password() {
        assertThatCode(() -> new SecurityStartupValidator(
                props("a-real-production-secret-with-at-least-32-bytes"),
                environmentWith("docker", "a-real-admin-initial-password"))
                .afterPropertiesSet()).doesNotThrowAnyException();
    }

    @Test
    void non_dev_profile_rejects_missing_admin_initial_password() {
        assertThatThrownBy(() -> new SecurityStartupValidator(
                props("a-real-production-secret-with-at-least-32-bytes"),
                environmentWith("docker", null))
                .afterPropertiesSet())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("ADMIN_INITIAL_PASSWORD");
    }

    @Test
    void non_dev_profile_rejects_blank_admin_initial_password() {
        assertThatThrownBy(() -> new SecurityStartupValidator(
                props("a-real-production-secret-with-at-least-32-bytes"),
                environmentWith("docker", "   "))
                .afterPropertiesSet())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("ADMIN_INITIAL_PASSWORD");
    }

    @Test
    void non_dev_profile_rejects_placeholder_admin_initial_password() {
        assertThatThrownBy(() -> new SecurityStartupValidator(
                props("a-real-production-secret-with-at-least-32-bytes"),
                environmentWith("docker", "dev-only-admin-initial-password-change-me"))
                .afterPropertiesSet())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("占位");
    }

    @Test
    void non_dev_profile_rejects_env_example_placeholder_admin_initial_password() {
        assertThatThrownBy(() -> new SecurityStartupValidator(
                props("a-real-production-secret-with-at-least-32-bytes"),
                environmentWith("docker", "change_me_admin_password"))
                .afterPropertiesSet())
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void dev_profile_allows_dev_only_admin_initial_password() {
        assertThatCode(() -> new SecurityStartupValidator(
                props("dev-only-jwt-secret-not-for-production-0123456789abcdef"),
                environmentWith("test", "dev-only-admin-initial-password-change-me"))
                .afterPropertiesSet()).doesNotThrowAnyException();
    }
}
