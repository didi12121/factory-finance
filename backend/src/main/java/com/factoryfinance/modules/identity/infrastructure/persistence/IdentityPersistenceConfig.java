package com.factoryfinance.modules.identity.infrastructure.persistence;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.context.annotation.Configuration;

/**
 * identity 模块持久化注册。
 *
 * <p>MyBatis-Plus 自动扫描仅覆盖应用入口包（bootstrap），业务 Mapper 按模块
 * 在各自 infrastructure 层注册（MybatisPlusConfig 约定）。</p>
 */
@Configuration
@MapperScan("com.factoryfinance.modules.identity.infrastructure.persistence")
public class IdentityPersistenceConfig {
}
