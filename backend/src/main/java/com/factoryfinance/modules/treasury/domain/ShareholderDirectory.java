package com.factoryfinance.modules.treasury.domain;

import java.util.Collection;
import java.util.Map;
import java.util.Optional;

/**
 * 股东目录读取端口（treasury 侧只读投影）。
 *
 * <p>出资校验要求"股东存在且启用"。masterdata 模块（Agent A 并行开发）尚未提供 api 接口，
 * 本端口是临时只读投影实现（仅 SELECT mst_shareholder），待 masterdata.api 发布后改为委托实现，
 * 不向 mst_shareholder 写入任何数据。</p>
 */
public interface ShareholderDirectory {

    /** 股东只读快照 */
    record ShareholderInfo(long id, String name, String status) {

        public boolean enabled() {
            return "ENABLED".equals(status);
        }
    }

    Optional<ShareholderInfo> findById(long id);

    /** 批量取名称（列表展示用），返回 id → name */
    Map<Long, String> names(Collection<Long> ids);
}
