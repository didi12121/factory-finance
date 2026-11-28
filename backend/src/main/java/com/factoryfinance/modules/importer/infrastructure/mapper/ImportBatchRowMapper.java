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

    /** 未完成行（待执行或失败），用于中断恢复 */
    @Select("SELECT * FROM imp_batch_row WHERE batch_id = #{batchId} AND status IN ('PENDING','FAILED') "
            + "ORDER BY row_no")
    List<ImportBatchRow> selectUnfinished(@Param("batchId") Long batchId);

    /** 按「模板 + 原始记录标识」查询历史成功导入（跨批次幂等判定） */
    @Select("SELECT * FROM imp_batch_row WHERE template_code = #{templateCode} AND source_ref = #{sourceRef} "
            + "AND status = 'SUCCESS' ORDER BY id LIMIT 1")
    ImportBatchRow selectImportedBySourceRef(@Param("templateCode") String templateCode,
                                             @Param("sourceRef") String sourceRef);
}
