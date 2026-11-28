package com.factoryfinance.modules.receivable.infrastructure;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.context.annotation.Configuration;

/**
 * receivable 模块 Mapper 扫描配置（按模块注册，禁止跨模块扫描）。
 */
@Configuration
@MapperScan("com.factoryfinance.modules.receivable.infrastructure.mapper")
public class ReceivableMapperConfig {
}
