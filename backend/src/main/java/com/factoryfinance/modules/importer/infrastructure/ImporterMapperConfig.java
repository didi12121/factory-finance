package com.factoryfinance.modules.importer.infrastructure;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.context.annotation.Configuration;

/**
 * importer 模块 Mapper 扫描配置（按模块注册，禁止跨模块扫描）。
 */
@Configuration
@MapperScan("com.factoryfinance.modules.importer.infrastructure.mapper")
public class ImporterMapperConfig {
}
