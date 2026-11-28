package com.factoryfinance.modules.importer.infrastructure.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.factoryfinance.modules.importer.domain.ImportBatch;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/**
 * 导入批次 Mapper。
 */
@Mapper
public interface ImportBatchMapper extends BaseMapper<ImportBatch> {

    /** 同一模板 + 同一文件内容（重复导入防护） */
    @Select("SELECT * FROM imp_batch WHERE template_code = #{templateCode} AND file_sha256 = #{fileSha256}")
    ImportBatch selectByFile(@Param("templateCode") String templateCode, @Param("fileSha256") String fileSha256);

    /** 当前最大批次序号（批次号 IMP-YYYYMMDD-0001 的当日序号） */
    @Select("SELECT MAX(CAST(SUBSTRING(batch_no, LENGTH(#{prefix}) + 1) AS UNSIGNED)) FROM imp_batch "
            + "WHERE batch_no REGEXP CONCAT('^', #{prefix}, '[0-9]+$')")
    Long selectMaxSeq(@Param("prefix") String prefix);
}
