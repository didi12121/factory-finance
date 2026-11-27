package com.factoryfinance.infrastructure.persistence;

import com.baomidou.mybatisplus.core.handlers.MetaObjectHandler;
import com.factoryfinance.infrastructure.security.CurrentUser;
import org.apache.ibatis.reflection.MetaObject;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;

/**
 * 审计字段自动填充：created_at/updated_at/created_by/updated_by。
 * 操作人取自 SecurityContext（未认证上下文回退 system，仅限非业务路径）。
 */
@Component
public class AuditMetaObjectHandler implements MetaObjectHandler {

    @Override
    public void insertFill(MetaObject metaObject) {
        LocalDateTime now = LocalDateTime.now();
        strictInsertFill(metaObject, "createdAt", LocalDateTime.class, now);
        strictInsertFill(metaObject, "updatedAt", LocalDateTime.class, now);
        strictInsertFill(metaObject, "createdBy", String.class, currentUsername());
        strictInsertFill(metaObject, "updatedBy", String.class, currentUsername());
    }

    @Override
    public void updateFill(MetaObject metaObject) {
        strictUpdateFill(metaObject, "updatedAt", LocalDateTime.class, LocalDateTime.now());
        strictUpdateFill(metaObject, "updatedBy", String.class, currentUsername());
    }

    private String currentUsername() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof CurrentUser user) {
            return user.username();
        }
        return CurrentUser.SYSTEM;
    }
}
