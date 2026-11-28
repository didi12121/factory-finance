package com.factoryfinance;

import com.factoryfinance.bootstrap.FactoryFinanceApplication;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
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
 * 集成测试基类：默认由 Testcontainers 启动真实 MySQL 8（需要本机 Docker 可用），
 * 验证 Spring 上下文、Flyway 迁移与数据源连接。
 *
 * <p>容器声明为 {@code @ServiceConnection} Bean，随应用上下文缓存跨测试类共享，
 * 避免每个测试类重建容器导致已缓存上下文的连接池失效。</p>
 *
 * <p>无 Docker 环境（如受限开发机）可用真实 MySQL 实例替代容器：
 * <pre>
 *   -Dff.testcontainers=false \
 *   -Dspring.datasource.url=jdbc:mysql://127.0.0.1:3307/factory_finance \
 *   -Dspring.datasource.username=factory -Dspring.datasource.password=app123
 * </pre>
 * 两种模式使用同一套真实 MySQL 8 语义（禁止以 H2 等替身通过测试）。</p>
 */
@SpringBootTest(classes = FactoryFinanceApplication.class)
@AutoConfigureMockMvc
@Import(AbstractIntegrationTest.TestcontainersConfiguration.class)
public abstract class AbstractIntegrationTest {

    @TestConfiguration(proxyBeanMethods = false)
    static class TestcontainersConfiguration {

        @Bean
        @ServiceConnection
        @ConditionalOnProperty(name = "ff.testcontainers", havingValue = "true", matchIfMissing = true)
        MySQLContainer<?> mysqlContainer() {
            return new MySQLContainer<>("mysql:8.4");
        }
    }

    @Autowired
    protected MockMvc mockMvc;

    @Autowired
    protected JdbcTemplate jdbcTemplate;
}
