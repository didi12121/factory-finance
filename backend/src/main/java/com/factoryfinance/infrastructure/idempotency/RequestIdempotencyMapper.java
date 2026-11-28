package com.factoryfinance.infrastructure.idempotency;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/**
 * 请求幂等记录 Mapper。
 */
@Mapper
public interface RequestIdempotencyMapper extends BaseMapper<RequestIdempotency> {

    /** 读取已占位/已完成的幂等记录（唯一键命中后读取已提交结果） */
    @Select("""
            SELECT * FROM sys_request_idempotency
            WHERE operation = #{operation} AND idem_key = #{idemKey}
            """)
    RequestIdempotency selectByKey(@Param("operation") String operation, @Param("idemKey") String idemKey);

    /**
     * 锁定读取幂等记录：唯一键冲突后的读取必须使用当前读（FOR UPDATE），
     * 否则 REPEATABLE READ 快照可能看不到并发事务刚提交的同键记录。
     */
    @Select("""
            SELECT * FROM sys_request_idempotency
            WHERE operation = #{operation} AND idem_key = #{idemKey}
            FOR UPDATE
            """)
    RequestIdempotency selectByKeyForUpdate(@Param("operation") String operation,
                                            @Param("idemKey") String idemKey);
}
