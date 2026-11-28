package com.factoryfinance.modules.importer.api.dto;

import java.util.List;

/**
 * Excel 导入 API 视图对象集合（模板 / 预览 / 批次 / 核对）。
 */
public final class ImportViews {

    private ImportViews() {
    }

    /** 模板列 */
    public record TemplateColumnView(String header, boolean required, String type, String example) {
    }

    /** 模板定义 */
    public record ImportTemplateView(String code, String displayName, List<TemplateColumnView> columns) {
    }

    /**
     * 单行结果。
     *
     * @param status   VALID（可导入）/ INVALID（校验失败）/ DUPLICATE（重复，跳过）/ SUCCESS（已导入）/
     *                 FAILED（导入失败）
     * @param messages 校验或导入失败原因（面向用户；空数组表示无问题）
     * @param bizDocType 成功行生成的业务单据类型
     * @param bizDocId   成功行生成的业务单据主键
     */
    public record ImportRowView(
            int rowNo,
            java.util.Map<String, String> values,
            String status,
            List<String> messages,
            String bizDocType,
            Long bizDocId) {
    }

    /** 导入前预览结果（不落库、不产生任何业务单据与资金流水） */
    public record ImportPreviewView(
            String templateCode,
            String displayName,
            String fileName,
            String fileSha256,
            /** 同一文件此前已确认导入时的批次号（重复导入提示；为空表示首次导入） */
            String existingBatchNo,
            int totalRows,
            int validRows,
            int invalidRows,
            int duplicateRows,
            List<ImportRowView> rows) {
    }

    /** 导入结果（含批次统计与逐行明细） */
    public record ImportBatchView(
            long id,
            String batchNo,
            String templateCode,
            String fileName,
            String status,
            int totalRows,
            int successRows,
            int failedRows,
            int duplicateRows,
            String createdAt,
            String importedAt,
            String createdBy,
            /** true 表示该文件此前已导入，本次直接返回既有批次（未重复记账） */
            boolean reused,
            List<ImportRowView> rows) {
    }
}
