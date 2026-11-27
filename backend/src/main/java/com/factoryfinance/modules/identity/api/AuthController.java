package com.factoryfinance.modules.identity.api;

import com.factoryfinance.common.api.ApiResponse;
import com.factoryfinance.modules.identity.api.dto.ChangePasswordRequest;
import com.factoryfinance.modules.identity.api.dto.LoginRequest;
import com.factoryfinance.modules.identity.api.dto.TokenResponse;
import com.factoryfinance.modules.identity.application.AuthService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 认证接口（/api/v1/auth）。
 *
 * <p>路由与请求校验；业务逻辑见 {@link AuthService}。
 * 登录公开（SecurityConfig 已放开），登出与修改密码需 Bearer 认证。</p>
 */
@RestController
@RequestMapping("/api/v1/auth")
public class AuthController implements AuthApi {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @Override
    @PostMapping("/login")
    public ApiResponse<TokenResponse> login(@Valid @RequestBody LoginRequest request) {
        return ApiResponse.success(authService.login(request));
    }

    @Override
    @PostMapping("/logout")
    public ApiResponse<Void> logout() {
        // 无状态令牌模式：服务端不做令牌吊销，仅记录预留（API_CONTRACT §10）
        return ApiResponse.success();
    }

    @Override
    @PutMapping("/password")
    public ApiResponse<Void> changePassword(@Valid @RequestBody ChangePasswordRequest request) {
        authService.changePassword(authService.currentUsername(), request);
        return ApiResponse.success();
    }
}
