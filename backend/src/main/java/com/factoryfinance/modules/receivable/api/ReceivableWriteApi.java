package com.factoryfinance.modules.receivable.api;

import java.util.Optional;

import com.factoryfinance.modules.receivable.api.dto.CreateReceivableRequest;
import com.factoryfinance.modules.receivable.api.dto.CreateReceiptRequest;

/**
 * 应收业务写入端口（模块间协作：api 包接口 + DTO）。
 *
 * <p>供数据迁移（importer）复用真实业务服务创建应收单与回款核销，
 * 保证财务校验、事务一致性、幂等与核销不超额规则不被绕过。</p>
 */
public interface ReceivableWriteApi {

    /** 新建应收单，返回应收单主键 */
    long createReceivable(CreateReceivableRequest request);

    /** 确认收款（含核销明细，同事务），返回收款单主键 */
    long createReceipt(CreateReceiptRequest request);

    /** 按对账单编号查询应收单（导入回款核销时解析对账单编号） */
    Optional<ReceivableRef> findReceivableByStatementNo(String statementNo);

    /** 应收单引用（核销所需的归属与余额信息） */
    record ReceivableRef(long id, String statementNo, long customerId, String outstandingAmount) {
    }
}
