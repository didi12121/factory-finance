package com.factoryfinance.modules.receivable.domain;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 应收单（rcv_receivable）—— 加工费对账形成的债权。
 *
 * <p>不变量：确认应收单不产生资金流水、不增加实际资金余额；已收/未收/回款状态/逾期
 * 全部由有效核销明细派生（不冗余存储）；单张应收累计有效核销 ≤ 原始应收金额。</p>
 */
@TableName("rcv_receivable")
public class Receivable {

    @TableId(type = IdType.AUTO)
    private Long id;
    private String statementNo;
    private Long customerId;
    private String accountingMonth;
    private LocalDate statementDate;
    private LocalDate dueDate;
    private BigDecimal originalAmount;
    private String remark;
    private String status;
    private Long voidRecordId;

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

    public String getStatementNo() {
        return statementNo;
    }

    public void setStatementNo(String statementNo) {
        this.statementNo = statementNo;
    }

    public Long getCustomerId() {
        return customerId;
    }

    public void setCustomerId(Long customerId) {
        this.customerId = customerId;
    }

    public String getAccountingMonth() {
        return accountingMonth;
    }

    public void setAccountingMonth(String accountingMonth) {
        this.accountingMonth = accountingMonth;
    }

    public LocalDate getStatementDate() {
        return statementDate;
    }

    public void setStatementDate(LocalDate statementDate) {
        this.statementDate = statementDate;
    }

    public LocalDate getDueDate() {
        return dueDate;
    }

    public void setDueDate(LocalDate dueDate) {
        this.dueDate = dueDate;
    }

    public BigDecimal getOriginalAmount() {
        return originalAmount;
    }

    public void setOriginalAmount(BigDecimal originalAmount) {
        this.originalAmount = originalAmount;
    }

    public String getRemark() {
        return remark;
    }

    public void setRemark(String remark) {
        this.remark = remark;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public Long getVoidRecordId() {
        return voidRecordId;
    }

    public void setVoidRecordId(Long voidRecordId) {
        this.voidRecordId = voidRecordId;
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
