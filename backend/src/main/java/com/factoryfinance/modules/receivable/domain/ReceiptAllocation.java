package com.factoryfinance.modules.receivable.domain;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 回款核销明细（rcv_receipt_allocation）—— 收款单 ↔ 应收单多对多匹配。
 *
 * <p>不变量：单笔核销金额 &gt; 0；单张应收累计有效核销 ≤ 原始应收；
 * 单张收款累计有效核销 ≤ 实际收款；核销不产生资金流水。
 * 撤销收款时明细置为 REVERSED（保留原事实并可追溯撤销单），不物理删除。</p>
 */
@TableName("rcv_receipt_allocation")
public class ReceiptAllocation {

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long receiptId;
    private Long receivableId;
    private BigDecimal allocationAmount;
    private String status;
    private Long reversedVoidRecordId;
    private LocalDateTime allocatedAt;

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

    public Long getReceiptId() {
        return receiptId;
    }

    public void setReceiptId(Long receiptId) {
        this.receiptId = receiptId;
    }

    public Long getReceivableId() {
        return receivableId;
    }

    public void setReceivableId(Long receivableId) {
        this.receivableId = receivableId;
    }

    public BigDecimal getAllocationAmount() {
        return allocationAmount;
    }

    public void setAllocationAmount(BigDecimal allocationAmount) {
        this.allocationAmount = allocationAmount;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public Long getReversedVoidRecordId() {
        return reversedVoidRecordId;
    }

    public void setReversedVoidRecordId(Long reversedVoidRecordId) {
        this.reversedVoidRecordId = reversedVoidRecordId;
    }

    public LocalDateTime getAllocatedAt() {
        return allocatedAt;
    }

    public void setAllocatedAt(LocalDateTime allocatedAt) {
        this.allocatedAt = allocatedAt;
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
