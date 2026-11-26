package com.factoryfinance;

import com.factoryfinance.bootstrap.FactoryFinanceApplication;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.MySQLContainer;

/**
 * 集成测试基类：Testcontainers 启动真实 MySQL 8，
 * 验证 Spring 上下文、Flyway 迁移与数据源连接（需要本机 Docker 可用）。
 *
 * <p>容器声明为 {@code @ServiceConnection} Bean，随应用上下文缓存跨测试类共享，
 * 避免每个测试类重建容器导致已缓存上下文的连接池失效。</p>
 */
@SpringBootTest(classes = FactoryFinanceApplication.class)
@AutoConfigureMockMvc
@Import(AbstractIntegrationTest.TestcontainersConfiguration.class)
public abstract class AbstractIntegrationTest {

    @TestConfiguration(proxyBeanMethods = false)
    static class TestcontainersConfiguration {

        @Bean
        @ServiceConnection
        MySQLContainer<?> mysqlContainer() {
            return new MySQLContainer<>("mysql:8.4");
        }
    }

    @Autowired
    protected MockMvc mockMvc;

    @Autowired
    protected JdbcTemplate jdbcTemplate;
}
