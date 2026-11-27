package com.factoryfinance.modules.identity.api;

import com.factoryfinance.common.api.ApiResponse;
import com.factoryfinance.modules.identity.api.dto.ChangePasswordRequest;
import com.factoryfinance.modules.identity.api.dto.LoginRequest;
import com.factoryfinance.modules.identity.api.dto.TokenResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

/**
 * 认证模块接口（API_CONTRACT 第 10 节）。
 *
 * <p>登录为公开端点；登出与修改密码需 Bearer 认证。响应统一使用
 * {@link ApiResponse} 包装。具体路由映射见 {@link AuthController}。</p>
 */
@Tag(name = "认证", description = "登录、登出与修改密码")
public interface AuthApi {

    @Operation(summary = "登录", description = "校验用户名密码并签发 HS256 访问令牌（用户名或密码错误统一 401，禁止用户枚举差异提示）")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "登录成功")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "用户名或密码错误")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "参数校验失败")
    ApiResponse<TokenResponse> login(LoginRequest request);

    @Operation(summary = "登出", description = "无状态令牌模式下记录/预留登出，成功响应即可")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "登出成功")
    ApiResponse<Void> logout();

    @Operation(summary = "修改密码", description = "校验旧密码后以 BCrypt 更新新密码（新密码至少 8 位）")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "修改成功")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "旧密码不正确")
    @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "参数校验失败")
    ApiResponse<Void> changePassword(ChangePasswordRequest request);
}
