package com.factoryfinance.modules.masterdata.application;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.factoryfinance.common.api.ErrorCode;
import com.factoryfinance.common.api.PageQuery;
import com.factoryfinance.common.api.PageResult;
import com.factoryfinance.common.exception.BusinessException;
import com.factoryfinance.modules.masterdata.api.dto.ShareholderCreateRequest;
import com.factoryfinance.modules.masterdata.api.dto.ShareholderResponse;
import com.factoryfinance.modules.masterdata.api.dto.ShareholderUpdateRequest;
import com.factoryfinance.modules.masterdata.domain.MasterdataConstants;
import com.factoryfinance.modules.masterdata.domain.Shareholder;
import com.factoryfinance.modules.masterdata.infrastructure.persistence.ShareholderMapper;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 股东应用服务（事务边界在 application 层）。
 *
 * <p>业务编号 SH-0001 递增（max+1，确定性规则），唯一键为最终防线；
 * 重复编号返回 409 CONFLICT。不提供删除：被股东出资等业务引用的记录
 * 以停用保留（API_CONTRACT §10）。</p>
 */
@Service
public class ShareholderService {

    private static final int GENERATE_RETRY_LIMIT = 3;

    private final ShareholderMapper shareholderMapper;

    public ShareholderService(ShareholderMapper shareholderMapper) {
        this.shareholderMapper = shareholderMapper;
    }

    /** 新增股东（缺省自动生成 SH-0001 递增编号） */
    @Transactional
    public ShareholderResponse create(ShareholderCreateRequest request) {
        String explicitNo = MasterdataConstants.trimToNull(request.shareholderNo());
        if (explicitNo != null) {
            Shareholder shareholder = buildShareholder(explicitNo, request);
            insertOrConflict(shareholder);
            return toResponse(shareholder);
        }
        // 自动编号：并发下唯一键兜底，冲突时按新 max 重算重试
        DuplicateKeyException lastConflict = null;
        for (int attempt = 0; attempt < GENERATE_RETRY_LIMIT; attempt++) {
            Shareholder shareholder = buildShareholder(nextShareholderNo(), request);
            try {
                shareholderMapper.insert(shareholder);
                return toResponse(shareholder);
            } catch (DuplicateKeyException ex) {
                lastConflict = ex;
            }
        }
        throw BusinessException.conflict("股东编号生成冲突，请重试: "
                + (lastConflict == null ? "" : lastConflict.getMessage()));
    }

    /** 股东列表（分页 + 关键字/状态筛选；关键字匹配名称、编号、联系方式） */
    public PageResult<ShareholderResponse> list(String keyword, String status, PageQuery query) {
        String normalizedStatus = validateStatus(status);
        String normalizedKeyword = MasterdataConstants.trimToNull(keyword);
        Page<Shareholder> page = new Page<>(query.normalizedPage(), query.normalizedSize());
        LambdaQueryWrapper<Shareholder> wrapper = new LambdaQueryWrapper<Shareholder>()
                .eq(normalizedStatus != null, Shareholder::getStatus, normalizedStatus)
                .and(normalizedKeyword != null, w -> w
                        .like(Shareholder::getName, normalizedKeyword)
                        .or().like(Shareholder::getShareholderNo, normalizedKeyword)
                        .or().like(Shareholder::getContact, normalizedKeyword))
                .orderByDesc(Shareholder::getId);
        Page<Shareholder> result = shareholderMapper.selectPage(page, wrapper);
        return PageResult.of(result.getRecords().stream().map(this::toResponse).toList(),
                result.getTotal(), query.normalizedPage(), query.normalizedSize());
    }

    /** 更新股东（含启停用；业务编号不可变） */
    @Transactional
    public ShareholderResponse update(Long id, ShareholderUpdateRequest request) {
        Shareholder shareholder = shareholderMapper.selectById(id);
        if (shareholder == null) {
            throw BusinessException.notFound("股东");
        }
        applyFields(shareholder, request.name(), request.contact(), request.remark());
        if (request.status() != null) {
            shareholder.setStatus(request.status());
        }
        shareholderMapper.updateById(shareholder);
        return toResponse(shareholder);
    }

    private Shareholder buildShareholder(String shareholderNo, ShareholderCreateRequest request) {
        Shareholder shareholder = new Shareholder();
        shareholder.setShareholderNo(shareholderNo);
        applyFields(shareholder, request.name(), request.contact(), request.remark());
        shareholder.setStatus(MasterdataConstants.STATUS_ENABLED);
        return shareholder;
    }

    private void applyFields(Shareholder shareholder, String name, String contact, String remark) {
        shareholder.setName(MasterdataConstants.trimToNull(name));
        shareholder.setContact(MasterdataConstants.trimToNull(contact));
        shareholder.setRemark(MasterdataConstants.trimToNull(remark));
    }

    private void insertOrConflict(Shareholder shareholder) {
        try {
            shareholderMapper.insert(shareholder);
        } catch (DuplicateKeyException ex) {
            throw BusinessException.conflict("股东编号已存在: " + shareholder.getShareholderNo());
        }
    }

    private String nextShareholderNo() {
        Integer max = shareholderMapper.selectMaxSequence();
        int next = (max == null ? 0 : max) + 1;
        return String.format("%s%04d", MasterdataConstants.SHAREHOLDER_NO_PREFIX, next);
    }

    private String validateStatus(String status) {
        String normalized = MasterdataConstants.trimToNull(status);
        if (normalized == null) {
            return null;
        }
        if (!MasterdataConstants.STATUS_ENABLED.equals(normalized)
                && !MasterdataConstants.STATUS_DISABLED.equals(normalized)) {
            Map<String, String> fieldErrors = new LinkedHashMap<>();
            fieldErrors.put("status", "状态只能是 ENABLED 或 DISABLED");
            throw new BusinessException(ErrorCode.VALIDATION_ERROR, ErrorCode.VALIDATION_ERROR.getDefaultMessage(),
                    Map.of("fieldErrors", fieldErrors));
        }
        return normalized;
    }

    private ShareholderResponse toResponse(Shareholder shareholder) {
        return new ShareholderResponse(shareholder.getId(), shareholder.getShareholderNo(), shareholder.getName(),
                shareholder.getContact(), shareholder.getRemark(), shareholder.getStatus(),
                MasterdataConstants.formatDateTime(shareholder.getCreatedAt()),
                MasterdataConstants.formatDateTime(shareholder.getUpdatedAt()));
    }
}
