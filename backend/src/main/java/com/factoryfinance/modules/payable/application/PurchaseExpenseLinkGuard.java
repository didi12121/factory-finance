package com.factoryfinance.modules.payable.application;

import com.factoryfinance.modules.payable.domain.Payable;
import com.factoryfinance.modules.payable.infrastructure.mapper.PayableMapper;
import com.factoryfinance.modules.treasury.api.FundDocumentVoidGuard;
import org.springframework.stereotype.Component;

import java.util.Optional;

/**
 * 采购支出撤销前置守卫（应付模块 → 资金模块的跨模块约束）。
 *
 * <p>已关联有效应付单（`funded_expense_id` 且应付单状态 CONFIRMED）的采购支出，
 * 说明存在对应的债务事实，直接撤销会造成应付单失去资金来源依据，
 * 因此必须先撤销应付单（撤销应付即解除关联），再撤销支出单。</p>
 */
@Component
public class PurchaseExpenseLinkGuard implements FundDocumentVoidGuard {

    private static final String EXPENSE_DOC_TYPE = "EXPENSE";

    private final PayableMapper payableMapper;

    public PurchaseExpenseLinkGuard(PayableMapper payableMapper) {
        this.payableMapper = payableMapper;
    }

    @Override
    public Optional<String> blockReason(String docType, long docId) {
        if (!EXPENSE_DOC_TYPE.equals(docType)) {
            return Optional.empty();
        }
        // 调用方 VoidService.voidExpense 已在同事务内锁定该采购支出行（selectByIdForUpdate），
        // 因此此处直接读取关联即可：与「创建关联应付单」互斥，不会读到过期状态
        Payable linked = payableMapper.selectActiveByFundedExpense(docId);
        if (linked == null) {
            return Optional.empty();
        }
        return Optional.of("该采购支出已关联有效应付单 " + linked.getPayableNo()
                + "，请先撤销该应付单后再撤销支出");
    }
}
