package com.factoryfinance.modules.treasury.infrastructure;

import com.factoryfinance.modules.treasury.domain.ShareholderDirectory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * 股东目录只读投影实现（临时）。
 *
 * <p>仅 SELECT mst_shareholder，不执行任何写入。masterdata 模块 api 发布后，
 * 本实现替换为对 masterdata.api 接口的委托（见 {@link ShareholderDirectory} 说明）。</p>
 */
@Component
public class ShareholderDirectoryJdbc implements ShareholderDirectory {

    private final JdbcTemplate jdbcTemplate;

    public ShareholderDirectoryJdbc(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public Optional<ShareholderInfo> findById(long id) {
        List<ShareholderInfo> rows = jdbcTemplate.query(
                "SELECT id, name, status FROM mst_shareholder WHERE id = ?",
                (rs, rowNum) -> new ShareholderInfo(rs.getLong("id"), rs.getString("name"), rs.getString("status")),
                id);
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    @Override
    public Map<Long, String> names(Collection<Long> ids) {
        Map<Long, String> result = new HashMap<>();
        if (ids == null || ids.isEmpty()) {
            return result;
        }
        StringBuilder in = new StringBuilder();
        for (int i = 0; i < ids.size(); i++) {
            in.append(i == 0 ? "?" : ",?");
        }
        jdbcTemplate.query(
                "SELECT id, name FROM mst_shareholder WHERE id IN (" + in + ")",
                (org.springframework.jdbc.core.RowCallbackHandler) rs ->
                        result.put(rs.getLong("id"), rs.getString("name")),
                ids.toArray());
        return result;
    }
}
