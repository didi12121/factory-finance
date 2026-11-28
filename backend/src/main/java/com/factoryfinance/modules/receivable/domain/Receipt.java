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
 * 收款单（rcv_receipt）—— 加工费实际到账事实。
 *
 * <p>不变量：一笔收款只生成一条资金流入流水（fund_transaction_id 唯一）；
 * 核销明细不产生资金流水；确认收款后资金余额增加、应收余额减少，营业收入不重复增加。</p>
 */
@TableName("rcv_receipt")
public class Receipt {

    @TableId(type = IdType.AUTO)
    private Long id;
    private String receiptNo;
    private Long customerId;
    private LocalDate receiptDate;
    private Long accountId;
    private BigDecimal actualAmount;
    private Long fundTransactionId;
    private String externalRef;
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

    public String getReceiptNo() {
        return receiptNo;
    }

    public void setReceiptNo(String receiptNo) {
        this.receiptNo = receiptNo;
    }

    public Long getCustomerId() {
        return customerId;
    }

    public void setCustomerId(Long customerId) {
        this.customerId = customerId;
    }

    public LocalDate getReceiptDate() {
        return receiptDate;
    }

    public void setReceiptDate(LocalDate receiptDate) {
        this.receiptDate = receiptDate;
    }

    public Long getAccountId() {
        return accountId;
    }

    public void setAccountId(Long accountId) {
        this.accountId = accountId;
    }

    public BigDecimal getActualAmount() {
        return actualAmount;
    }

    public void setActualAmount(BigDecimal actualAmount) {
        this.actualAmount = actualAmount;
    }

    public Long getFundTransactionId() {
        return fundTransactionId;
    }

    public void setFundTransactionId(Long fundTransactionId) {
        this.fundTransactionId = fundTransactionId;
    }

    public String getExternalRef() {
        return externalRef;
    }

    public void setExternalRef(String externalRef) {
        this.externalRef = externalRef;
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
