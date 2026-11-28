package com.factoryfinance.modules.payable.infrastructure;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.context.annotation.Configuration;

/**
 * payable 模块 Mapper 扫描配置（按模块注册，禁止跨模块扫描）。
 */
@Configuration
@MapperScan("com.factoryfinance.modules.payable.infrastructure.mapper")
public class PayableMapperConfig {
}
