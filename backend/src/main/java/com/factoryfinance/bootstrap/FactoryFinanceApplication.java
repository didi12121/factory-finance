package com.factoryfinance.bootstrap;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

/**
 * Factory Finance 模块化单体应用入口。
 *
 * <p>模块边界与依赖规则见 docs/ARCHITECTURE.md。当前阶段仅包含基础设施，
 * 业务模块将在后续阶段按业务领域逐步实现。</p>
 */
@SpringBootApplication(scanBasePackages = "com.factoryfinance")
@ConfigurationPropertiesScan(basePackages = "com.factoryfinance")
public class FactoryFinanceApplication {

    public static void main(String[] args) {
        SpringApplication.run(FactoryFinanceApplication.class, args);
    }
}
