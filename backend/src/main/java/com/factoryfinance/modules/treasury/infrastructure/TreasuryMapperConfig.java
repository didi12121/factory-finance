package com.factoryfinance.modules.treasury.infrastructure;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.context.annotation.Configuration;

/**
 * treasury 模块 Mapper 扫描配置。
 *
 * <p>MyBatis-Plus 自动扫描基准包取自 {@code @SpringBootApplication} 所在包
 * （{@code com.factoryfinance.bootstrap}），不覆盖 {@code modules.*} 下的 Mapper；
 * 本配置按模块注册 treasury 的 Mapper（MybatisPlusConfig 注释约定"业务 Mapper 在对应模块
 * infrastructure 层按模块注册"）。</p>
 */
@Configuration
@MapperScan("com.factoryfinance.modules.treasury.infrastructure.mapper")
public class TreasuryMapperConfig {
}
