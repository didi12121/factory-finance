package com.factoryfinance.modules.identity.application;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.factoryfinance.common.api.ErrorCode;
import com.factoryfinance.common.exception.BusinessException;
import com.factoryfinance.infrastructure.security.CurrentUser;
import com.factoryfinance.infrastructure.security.JwtService;
import com.factoryfinance.modules.identity.api.dto.ChangePasswordRequest;
import com.factoryfinance.modules.identity.api.dto.LoginRequest;
import com.factoryfinance.modules.identity.api.dto.LoginUserResponse;
import com.factoryfinance.modules.identity.api.dto.TokenResponse;
import com.factoryfinance.modules.identity.domain.SysUser;
import com.factoryfinance.modules.identity.infrastructure.persistence.SysUserMapper;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;

/**
 * 认证应用服务：登录、登出记录、修改密码。
 *
 * <p>用户枚举防护：用户名不存在、密码错误、账号停用一律返回相同的
 * 401 {@code UNAUTHORIZED} 与相同提示；用户不存在时仍执行一次 BCrypt
 * 校验以拉平时间差异。</p>
 */
@Service
public class AuthService {

    /** 登录失败统一提示（禁止用户枚举差异提示） */
    static final String LOGIN_FAILED_MESSAGE = "用户名或密码错误";

    private final SysUserMapper sysUserMapper;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final String dummyHash;

    public AuthService(SysUserMapper sysUserMapper,
                       PasswordEncoder passwordEncoder,
                       JwtService jwtService) {
        this.sysUserMapper = sysUserMapper;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        // 时间侧信道均衡：用户不存在时执行等价 BCrypt 计算
        this.dummyHash = passwordEncoder.encode("timing-equalizer-dummy-password");
    }

    /**
     * 登录：校验用户名密码并签发 HS256 令牌（claims: sub=username, name=displayName）。
     *
     * @throws BusinessException 401 UNAUTHORIZED（用户名不存在 / 密码错误 / 账号停用同一提示）
     */
    public TokenResponse login(LoginRequest request) {
        SysUser user = findByUsername(request.username());
        if (user == null) {
            passwordEncoder.matches(request.password(), dummyHash);
            throw unauthorized();
        }
        boolean passwordMatches = passwordEncoder.matches(request.password(), user.getPasswordHash());
        boolean enabled = SysUser.STATUS_ENABLED.equals(user.getStatus());
        if (!passwordMatches || !enabled) {
            throw unauthorized();
        }
        String token = jwtService.generateToken(user.getUsername(), Map.of("name", user.getDisplayName()));
        long expiresAt = jwtService.parseToken(token).getExpiration().getTime() / 1000;
        return TokenResponse.bearer(token, expiresAt,
                new LoginUserResponse(user.getUsername(), user.getDisplayName()));
    }

    /**
     * 修改密码：校验旧密码后以 BCrypt 更新新密码（新密码 ≥ 8 位由请求校验保证）。
     *
     * @param username 当前登录用户名（取自令牌）
     * @throws BusinessException 401 UNAUTHORIZED（旧密码错误）；404（用户不存在）
     */
    @Transactional
    public void changePassword(String username, ChangePasswordRequest request) {
        SysUser user = findByUsername(username);
        if (user == null) {
            throw BusinessException.notFound("用户");
        }
        if (!passwordEncoder.matches(request.oldPassword(), user.getPasswordHash())) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED, "旧密码不正确");
        }
        user.setPasswordHash(passwordEncoder.encode(request.newPassword()));
        sysUserMapper.updateById(user);
    }

    /** 当前登录用户名（未认证抛 401，业务接口不允许匿名） */
    public String currentUsername() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof CurrentUser user) {
            return user.username();
        }
        throw new BusinessException(ErrorCode.UNAUTHORIZED);
    }

    private SysUser findByUsername(String username) {
        return sysUserMapper.selectOne(new LambdaQueryWrapper<SysUser>().eq(SysUser::getUsername, username));
    }

    private BusinessException unauthorized() {
        return new BusinessException(ErrorCode.UNAUTHORIZED, LOGIN_FAILED_MESSAGE);
    }
}
