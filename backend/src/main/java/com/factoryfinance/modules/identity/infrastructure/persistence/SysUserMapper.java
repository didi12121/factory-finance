package com.factoryfinance.modules.identity.infrastructure.persistence;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.factoryfinance.modules.identity.domain.SysUser;
import org.apache.ibatis.annotations.Mapper;

/**
 * sys_user 数据访问。用户名唯一（uk_sys_user_username）。
 */
@Mapper
public interface SysUserMapper extends BaseMapper<SysUser> {
}
