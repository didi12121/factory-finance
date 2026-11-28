package com.factoryfinance.modules.importer.domain;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

import java.time.LocalDateTime;

/**
 * 导入行明细（imp_batch_row）：逐行结果，成功行记录生成的业务单据类型与主键（可追溯）。
 */
@TableName("imp_batch_row")
public class ImportBatchRow {

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long batchId;
    private Integer rowNo;
    /** 模板编码（跨批次按「模板 + 原始记录标识」去重） */
    private String templateCode;
    /** 原始记录标识（财务模板必填；主数据模板为空） */
    private String sourceRef;
    /** 规范化内容哈希（判断「同标识同内容=重复」「同标识不同内容=冲突」） */
    private String contentHash;
    /** 原始行值 JSON（恢复中断批次时重建写命令） */
    private String rowValues;
    private String status;
    private String message;
    private String bizDocType;
    private Long bizDocId;
    private String rowData;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
    @TableField(fill = FieldFill.INSERT)
    private String createdBy;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Long getBatchId() {
        return batchId;
    }

    public String getTemplateCode() {
        return templateCode;
    }

    public void setTemplateCode(String templateCode) {
        this.templateCode = templateCode;
    }

    public String getSourceRef() {
        return sourceRef;
    }

    public void setSourceRef(String sourceRef) {
        this.sourceRef = sourceRef;
    }

    public String getContentHash() {
        return contentHash;
    }

    public void setContentHash(String contentHash) {
        this.contentHash = contentHash;
    }

    public String getRowValues() {
        return rowValues;
    }

    public void setRowValues(String rowValues) {
        this.rowValues = rowValues;
    }

    public void setBatchId(Long batchId) {
        this.batchId = batchId;
    }

    public Integer getRowNo() {
        return rowNo;
    }

    public void setRowNo(Integer rowNo) {
        this.rowNo = rowNo;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }

    public String getBizDocType() {
        return bizDocType;
    }

    public void setBizDocType(String bizDocType) {
        this.bizDocType = bizDocType;
    }

    public Long getBizDocId() {
        return bizDocId;
    }

    public void setBizDocId(Long bizDocId) {
        this.bizDocId = bizDocId;
    }

    public String getRowData() {
        return rowData;
    }

    public void setRowData(String rowData) {
        this.rowData = rowData;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public String getCreatedBy() {
        return createdBy;
    }

    public void setCreatedBy(String createdBy) {
        this.createdBy = createdBy;
    }
}
