package com.factoryfinance.infrastructure.idempotency;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.context.annotation.Configuration;

/**
 * 请求幂等记录 Mapper 扫描配置。
 *
 * <p>MyBatis-Plus 自动扫描基准包取自 {@code @SpringBootApplication} 所在包
 * （{@code com.factoryfinance.bootstrap}），不覆盖基础设施子包；
 * 本配置显式注册幂等记录 Mapper。</p>
 */
@Configuration
@MapperScan("com.factoryfinance.infrastructure.idempotency")
public class IdempotencyMapperConfig {
}
