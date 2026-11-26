package com.factoryfinance.modules.identity.api;

import com.factoryfinance.modules.identity.api.dto.LoginRequest;
import com.factoryfinance.modules.identity.api.dto.TokenResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;

/**
 * 认证模块接口设计（Phase 1 实现）。
 *
 * <p>本阶段仅保留接口设计与安全基础配置，不提供实现，也不发布对应路由。
 * 用户、角色、权限及 JWT 生命周期管理在 Phase 1 实现后方可在网关暴露。</p>
 */
@Tag(name = "认证", description = "登录与令牌管理（Phase 1 实现）")
public interface AuthApi {

    @Operation(summary = "登录", description = "校验用户名密码并签发访问令牌（Phase 1 实现）")
    @ApiResponse(responseCode = "200", description = "登录成功")
    @ApiResponse(responseCode = "401", description = "用户名或密码错误")
    ResponseEntity<TokenResponse> login(@Valid LoginRequest request);
}
