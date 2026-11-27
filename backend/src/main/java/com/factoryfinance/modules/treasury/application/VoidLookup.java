package com.factoryfinance.modules.treasury.application;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.factoryfinance.modules.treasury.domain.VoidRecord;
import com.factoryfinance.modules.treasury.infrastructure.mapper.VoidRecordMapper;
import org.springframework.stereotype.Component;

import java.util.Collection;
import java.util.HashMap;
import java.util.Map;

/**
 * 撤销关联读取（列表与流水的撤销追溯）。
 */
@Component
public class VoidLookup {

    private final VoidRecordMapper voidRecordMapper;

    public VoidLookup(VoidRecordMapper voidRecordMapper) {
        this.voidRecordMapper = voidRecordMapper;
    }

    /** 原单据 id → 撤销记录（按撤销目标类型） */
    public Map<Long, VoidRecord> byTarget(String targetDocType, Collection<Long> targetIds) {
        Map<Long, VoidRecord> result = new HashMap<>();
        if (targetIds == null || targetIds.isEmpty()) {
            return result;
        }
        voidRecordMapper.selectList(new QueryWrapper<VoidRecord>()
                        .eq("target_doc_type", targetDocType)
                        .in("target_doc_id", targetIds))
                .forEach(v -> result.put(v.getTargetDocId(), v));
        return result;
    }

    /** 撤销记录 id → 撤销记录（VOID 反向流水追溯） */
    public Map<Long, VoidRecord> byIds(Collection<Long> ids) {
        Map<Long, VoidRecord> result = new HashMap<>();
        if (ids == null || ids.isEmpty()) {
            return result;
        }
        voidRecordMapper.selectBatchIds(ids).forEach(v -> result.put(v.getId(), v));
        return result;
    }
}
