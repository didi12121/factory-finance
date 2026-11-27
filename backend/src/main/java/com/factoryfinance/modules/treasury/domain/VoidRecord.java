package com.factoryfinance.modules.treasury.domain;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 撤销记录（tst_void_record）。
 * 保留原单据（status=VOIDED、void_record_id 关联）与原流水（业务事实保留），
 * 同事务创建反向流水（source_doc_type='VOID', source_doc_id=本记录 id）纠正余额。
 * uk_tst_void_target 防重复撤销。
 */
@TableName("tst_void_record")
public class VoidRecord {

    @TableId(type = IdType.AUTO)
    private Long id;
    private String voidNo;
    private String targetDocType;
    private Long targetDocId;
    private LocalDate voidDate;
    private String reason;
    /** 反向流水 id（转账撤销含两条反向流水时记录首条，其余经 source_doc_id 关联） */
    private Long reverseTransactionId;

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

    public String getVoidNo() {
        return voidNo;
    }

    public void setVoidNo(String voidNo) {
        this.voidNo = voidNo;
    }

    public String getTargetDocType() {
        return targetDocType;
    }

    public void setTargetDocType(String targetDocType) {
        this.targetDocType = targetDocType;
    }

    public Long getTargetDocId() {
        return targetDocId;
    }

    public void setTargetDocId(Long targetDocId) {
        this.targetDocId = targetDocId;
    }

    public LocalDate getVoidDate() {
        return voidDate;
    }

    public void setVoidDate(LocalDate voidDate) {
        this.voidDate = voidDate;
    }

    public String getReason() {
        return reason;
    }

    public void setReason(String reason) {
        this.reason = reason;
    }

    public Long getReverseTransactionId() {
        return reverseTransactionId;
    }

    public void setReverseTransactionId(Long reverseTransactionId) {
        this.reverseTransactionId = reverseTransactionId;
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
