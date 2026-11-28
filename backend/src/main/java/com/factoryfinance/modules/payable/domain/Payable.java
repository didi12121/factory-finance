package com.factoryfinance.modules.payable.domain;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 应付单（pay_payable）—— 对供应商形成的债务。
 *
 * <p>不变量：确认应付单不立即扣减资金；确认付款才产生实际资金流出并减少对应应付余额；
 * 已通过 Phase 1 直接登记的采购付款（funded_expense_id）不得再次作为应付款付款重复扣减资金。</p>
 */
@TableName("pay_payable")
public class Payable {

    @TableId(type = IdType.AUTO)
    private Long id;
    private String payableNo;
    private Long supplierId;
    private LocalDate bizDate;
    private String accountingMonth;
    private LocalDate dueDate;
    private BigDecimal amount;
    private String content;
    private String remark;
    private Long fundedExpenseId;
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

    public String getPayableNo() {
        return payableNo;
    }

    public void setPayableNo(String payableNo) {
        this.payableNo = payableNo;
    }

    public Long getSupplierId() {
        return supplierId;
    }

    public void setSupplierId(Long supplierId) {
        this.supplierId = supplierId;
    }

    public LocalDate getBizDate() {
        return bizDate;
    }

    public void setBizDate(LocalDate bizDate) {
        this.bizDate = bizDate;
    }

    public String getAccountingMonth() {
        return accountingMonth;
    }

    public void setAccountingMonth(String accountingMonth) {
        this.accountingMonth = accountingMonth;
    }

    public LocalDate getDueDate() {
        return dueDate;
    }

    public void setDueDate(LocalDate dueDate) {
        this.dueDate = dueDate;
    }

    public BigDecimal getAmount() {
        return amount;
    }

    public void setAmount(BigDecimal amount) {
        this.amount = amount;
    }

    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content;
    }

    public String getRemark() {
        return remark;
    }

    public void setRemark(String remark) {
        this.remark = remark;
    }

    public Long getFundedExpenseId() {
        return fundedExpenseId;
    }

    public void setFundedExpenseId(Long fundedExpenseId) {
        this.fundedExpenseId = fundedExpenseId;
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
