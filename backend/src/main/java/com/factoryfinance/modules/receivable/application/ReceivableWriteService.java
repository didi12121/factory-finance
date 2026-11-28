package com.factoryfinance.modules.receivable.application;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.factoryfinance.common.money.Money;
import com.factoryfinance.modules.receivable.api.ReceivableWriteApi;
import com.factoryfinance.modules.receivable.api.dto.CreateReceivableRequest;
import com.factoryfinance.modules.receivable.api.dto.CreateReceiptRequest;
import com.factoryfinance.modules.receivable.domain.Receivable;
import com.factoryfinance.modules.receivable.infrastructure.mapper.ReceivableMapper;
import org.springframework.stereotype.Component;

import java.util.Optional;

/**
 * 应收写入端口实现：委托既有业务服务（事务、幂等、核销规则一致）。
 */
@Component
public class ReceivableWriteService implements ReceivableWriteApi {

    private final ReceivableService receivableService;
    private final ReceiptService receiptService;
    private final ReceivableMapper receivableMapper;

    public ReceivableWriteService(ReceivableService receivableService, ReceiptService receiptService,
                                  ReceivableMapper receivableMapper) {
        this.receivableService = receivableService;
        this.receiptService = receiptService;
        this.receivableMapper = receivableMapper;
    }

    @Override
    public long createReceivable(CreateReceivableRequest request) {
        return receivableService.create(request).id();
    }

    @Override
    public long createReceipt(CreateReceiptRequest request) {
        return receiptService.create(request).id();
    }

    @Override
    public Optional<ReceivableRef> findReceivableByStatementNo(String statementNo) {
        if (statementNo == null || statementNo.isBlank()) {
            return Optional.empty();
        }
        Receivable receivable = receivableMapper.selectOne(new QueryWrapper<Receivable>()
                .eq("statement_no", statementNo.trim())
                .last("LIMIT 1"));
        if (receivable == null) {
            return Optional.empty();
        }
        java.math.BigDecimal allocated = receivableMapper.selectActiveAllocatedSum(receivable.getId());
        java.math.BigDecimal outstanding = receivable.getOriginalAmount()
                .subtract(allocated == null ? java.math.BigDecimal.ZERO : allocated);
        if (outstanding.signum() < 0) {
            outstanding = java.math.BigDecimal.ZERO;
        }
        return Optional.of(new ReceivableRef(receivable.getId(), receivable.getStatementNo(),
                receivable.getCustomerId(), Money.str(outstanding)));
    }
}
