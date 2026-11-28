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
