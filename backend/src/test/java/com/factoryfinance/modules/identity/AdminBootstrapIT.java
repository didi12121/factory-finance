package com.factoryfinance.modules.identity;

import com.factoryfinance.AbstractIntegrationTest;
import com.factoryfinance.modules.identity.application.AdminUserInitializer;
import com.factoryfinance.modules.identity.infrastructure.AdminBootstrapProperties;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 管理员初始化集成测试：sys_user 空表时创建 admin，重复执行幂等。
 */
class AdminBootstrapIT extends AbstractIntegrationTest {

    @Autowired
    private AdminUserInitializer adminUserInitializer;

    @Autowired
    private AdminBootstrapProperties adminBootstrapProperties;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Test
    void admin_created_on_startup_with_expected_fields() {
        Map<String, Object> row = jdbcTemplate.queryForMap(
                "SELECT username, display_name, status, password_hash, created_at FROM sys_user WHERE username = ?",
                "admin");

        assertThat(row.get("display_name")).isEqualTo("管理员");
        assertThat(row.get("status")).isEqualTo("ENABLED");
        assertThat(row.get("created_at")).isNotNull();
        // 初始密码取环境变量 ADMIN_INITIAL_PASSWORD（dev profile 为 dev-only 默认值）
        assertThat(passwordEncoder.matches(adminBootstrapProperties.getInitialPassword(),
                String.valueOf(row.get("password_hash")))).isTrue();
    }

    @Test
    void admin_initialization_is_idempotent() {
        Integer before = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM sys_user", Integer.class);
        Integer adminBefore = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_user WHERE username = 'admin'", Integer.class);

        // 再次执行初始化（模拟重复启动/并发实例）
        adminUserInitializer.run();
        adminUserInitializer.run();

        Integer after = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM sys_user", Integer.class);
        Integer adminAfter = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_user WHERE username = 'admin'", Integer.class);

        assertThat(adminBefore).isEqualTo(1);
        assertThat(adminAfter).isEqualTo(1);
        assertThat(after).isEqualTo(before);
    }
}
