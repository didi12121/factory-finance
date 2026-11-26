package com.factoryfinance;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Flyway 迁移及 MySQL 连接验证。
 */
class FlywayMigrationIT extends AbstractIntegrationTest {

    @Test
    void flyway_baseline_migration_applied() {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "select version, description, success from flyway_schema_history order by installed_rank");

        assertThat(rows).isNotEmpty();
        Map<String, Object> baseline = rows.stream()
                .filter(row -> "1".equals(String.valueOf(row.get("version"))))
                .findFirst()
                .orElseThrow();
        assertThat(String.valueOf(baseline.get("description"))).contains("init");
        assertThat(Boolean.TRUE.equals(baseline.get("success"))).isTrue();
    }
}
