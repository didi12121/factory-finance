package com.factoryfinance;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Spring Boot 上下文启动测试（真实 MySQL + Flyway）。
 */
class ApplicationStartupIT extends AbstractIntegrationTest {

    @Test
    void context_loads_with_mysql_datasource() {
        String url = jdbcTemplate.queryForObject("select database()", String.class);
        assertThat(url).isNotBlank();

        Integer alive = jdbcTemplate.queryForObject("select 1", Integer.class);
        assertThat(alive).isEqualTo(1);
    }
}
