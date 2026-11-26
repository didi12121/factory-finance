package com.factoryfinance.infrastructure.web;

import com.factoryfinance.common.api.ApiResponse;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import io.swagger.v3.oas.models.Components;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.Map;

/**
 * OpenAPI 文档配置（仅 dev/test 环境启用完整文档）。
 */
@Configuration
public class OpenApiConfig {

    @Bean
    @Profile("!docker")
    public OpenAPI factoryFinanceOpenApi() {
        final String schemeName = "bearerAuth";
        return new OpenAPI()
                .info(new Info()
                        .title("Factory Finance API")
                        .description("工厂财务管理系统 API。金额统一使用十进制字符串传输；统一响应模型见 docs/API_CONTRACT.md。")
                        .version("0.1.0"))
                .components(new Components().addSecuritySchemes(schemeName,
                        new SecurityScheme()
                                .name(schemeName)
                                .type(SecurityScheme.Type.HTTP)
                                .scheme("bearer")
                                .bearerFormat("JWT")))
                .addSecurityItem(new SecurityRequirement().addList(schemeName));
    }

    /**
     * 基础健康检查接口。
     *
     * <p>业务 API 尚未开放；本接口用于部署与运维验证，允许匿名访问。</p>
     */
    @RestController
    @RequestMapping("/api/v1/health")
    public static class HealthController {

        @GetMapping
        public ApiResponse<Map<String, Object>> health() {
            return ApiResponse.success(Map.of(
                    "status", "UP",
                    "service", "factory-finance",
                    "time", Instant.now().toString()));
        }
    }
}
