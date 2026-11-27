package com.factoryfinance.modules.identity.application;

import com.factoryfinance.modules.identity.domain.SysUser;
import com.factoryfinance.modules.identity.infrastructure.AdminBootstrapProperties;
import com.factoryfinance.modules.identity.infrastructure.persistence.SysUserMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * 管理员初始化：sys_user 空表时创建 admin 账号（display_name=管理员）。
 *
 * <p>初始密码取环境变量 {@code ADMIN_INITIAL_PASSWORD}（dev profile 有明确
 * dev-only 默认值；非 dev/test 环境由 {@code SecurityStartupValidator}
 * 禁止占位/空值）。幂等：表内已有用户时不再创建，并发初始化由用户名唯一键兜底。</p>
 */
@Component
public class AdminUserInitializer implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(AdminUserInitializer.class);

    static final String ADMIN_USERNAME = "admin";
    static final String ADMIN_DISPLAY_NAME = "管理员";

    private final SysUserMapper sysUserMapper;
    private final PasswordEncoder passwordEncoder;
    private final AdminBootstrapProperties properties;

    public AdminUserInitializer(SysUserMapper sysUserMapper,
                                PasswordEncoder passwordEncoder,
                                AdminBootstrapProperties properties) {
        this.sysUserMapper = sysUserMapper;
        this.passwordEncoder = passwordEncoder;
        this.properties = properties;
    }

    @Override
    public void run(String... args) {
        Long existing = sysUserMapper.selectCount(null);
        if (existing != null && existing > 0) {
            return;
        }
        String initialPassword = properties.getInitialPassword();
        if (initialPassword == null || initialPassword.isBlank()) {
            throw new IllegalStateException("管理员初始密码为空：请通过环境变量 ADMIN_INITIAL_PASSWORD 注入初始密码");
        }
        SysUser admin = new SysUser();
        admin.setUsername(ADMIN_USERNAME);
        admin.setDisplayName(ADMIN_DISPLAY_NAME);
        admin.setPasswordHash(passwordEncoder.encode(initialPassword));
        admin.setStatus(SysUser.STATUS_ENABLED);
        try {
            sysUserMapper.insert(admin);
            log.info("管理员账号初始化完成: username={}", ADMIN_USERNAME);
        } catch (DuplicateKeyException ex) {
            // 幂等：其他实例已并发初始化
            log.info("管理员账号已存在，跳过初始化");
        }
    }
}
