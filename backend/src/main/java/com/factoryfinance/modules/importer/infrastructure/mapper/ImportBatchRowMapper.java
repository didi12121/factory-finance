package com.factoryfinance.modules.importer.infrastructure.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.factoryfinance.modules.importer.domain.ImportBatchRow;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * 导入行明细 Mapper。
 */
@Mapper
public interface ImportBatchRowMapper extends BaseMapper<ImportBatchRow> {

    @Select("SELECT * FROM imp_batch_row WHERE batch_id = #{batchId} ORDER BY row_no")
    List<ImportBatchRow> selectByBatch(@Param("batchId") Long batchId);
}
