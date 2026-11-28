package com.factoryfinance.payable;

import com.factoryfinance.receivable.Phase2TestSupport;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 采购支出 ↔ 应付单关联完整性（MVP 上线准备 §1）：
 * <ol>
 *   <li>同一笔采购支出最多关联一张有效应付单（应用事务校验 + 数据库生成列唯一键）；</li>
 *   <li>关联后应付单视为已支付（SETTLED），且禁止再次付款；</li>
 *   <li>已被有效应付单引用的采购支出禁止直接撤销（409）；撤销应付单后关联解除、支出可撤销；</li>
 *   <li>并发重复关联只允许一笔成功；</li>
 *   <li>可关联支出列表排除已被引用者。</li>
 * </ol>
 */
class PurchasePayableLinkIT extends Phase2TestSupport {

    @Test
    void linkExpenseMakesPayableSettledAndExcludedFromFundableList() throws Exception {
        long supplierId = seedSupplier("关联供应商");
        long accountId = seedAccount("关联账户", "BANK", "10000.00", today());
        long expenseId = createPurchaseExpense(accountId, "2500.00");

        JsonNode candidates = get("/api/v1/payable/payables/fundable-expenses").data();
        assertThat(candidates.toString()).as("未被引用的采购支出应出现在候选列表").contains("\"expenseId\":" + expenseId);

        JsonNode payable = createLinkedPayable(supplierId, expenseId, "2500.00");
        assertThat(payable.path("paymentStatus").asText()).as("关联后视为已支付").isEqualTo("SETTLED");
        assertThat(payable.path("outstandingAmount").asText()).isEqualTo("0.00");
        assertThat(payable.path("fundedExpenseId").asLong()).isEqualTo(expenseId);

        JsonNode afterLink = get("/api/v1/payable/payables/fundable-expenses").data();
        assertThat(afterLink.toString()).as("已被引用的支出不再出现在候选列表")
                .doesNotContain("\"expenseId\":" + expenseId);
        // 资金余额不因建立关联再次扣减（支出支付时已扣减）
        assertThat(rawBalance(accountId)).isEqualByComparingTo("7500");
    }

    @Test
    void duplicateLinkRejectedWithConflict() throws Exception {
        long supplierId = seedSupplier("重复关联供应商");
        long accountId = seedAccount("重复关联账户", "BANK", "10000.00", today());
        long expenseId = createPurchaseExpense(accountId, "1200.00");

        assertThat(createLinkedPayable(supplierId, expenseId, "1200.00").path("id").asLong()).isPositive();

        HttpResult duplicate = post("/api/v1/payable/payables", map(
                "supplierId", supplierId,
                "bizDate", today(),
                "accountingMonth", currentMonth(),
                "amount", "1200.00",
                "content", "重复关联",
                "fundedExpenseId", expenseId,
                "idempotencyKey", newIdempotencyKey()));
        assertThat(duplicate.status()).as("同一支出重复关联必须拒绝：%s", duplicate.body()).isEqualTo(409);
        assertThat(count("SELECT COUNT(*) FROM pay_payable WHERE funded_expense_id = ?", expenseId)).isEqualTo(1);
        assertThat(rawBalance(accountId)).isEqualByComparingTo("8800");
    }

    @Test
    void voidExpenseBlockedWhileLinkedThenAllowedAfterPayableVoided() throws Exception {
        long supplierId = seedSupplier("撤销守卫供应商");
        long accountId = seedAccount("撤销守卫账户", "BANK", "5000.00", today());
        long expenseId = createPurchaseExpense(accountId, "1500.00");
        long payableId = createLinkedPayable(supplierId, expenseId, "1500.00").path("id").asLong();

        HttpResult blocked = post("/api/v1/treasury/expenses/" + expenseId + "/void",
                map("voidDate", today(), "reason", "尝试撤销"));
        assertThat(blocked.status()).as("已被有效应付单引用的采购支出禁止撤销：%s", blocked.body()).isEqualTo(409);
        assertThat(blocked.message()).contains("应付单");
        assertThat(count("SELECT COUNT(*) FROM tst_expense WHERE id = ? AND status = 'CONFIRMED'", expenseId))
                .isEqualTo(1);

        HttpResult voidPayable = post("/api/v1/payable/payables/" + payableId + "/void",
                map("voidDate", today(), "reason", "解除关联"));
        assertThat(voidPayable.status()).as("撤销应付单应成功：%s", voidPayable.body()).isEqualTo(200);

        // 关联解除后支出可撤销（应付款仅为债务事实，不产生资金反向流水）
        HttpResult voidExpense = post("/api/v1/treasury/expenses/" + expenseId + "/void",
                map("voidDate", today(), "reason", "撤销支出"));
        assertThat(voidExpense.status()).as("关联解除后支出可撤销：%s", voidExpense.body()).isEqualTo(200);
        assertThat(rawBalance(accountId)).as("支出与撤销反向流水净额为 0").isEqualByComparingTo("5000");
    }

    @Test
    void voidedPayableAllowsRelinkOfSameExpense() throws Exception {
        long supplierId = seedSupplier("重新关联供应商");
        long accountId = seedAccount("重新关联账户", "BANK", "6000.00", today());
        long expenseId = createPurchaseExpense(accountId, "800.00");

        long firstPayable = createLinkedPayable(supplierId, expenseId, "800.00").path("id").asLong();
        assertThat(post("/api/v1/payable/payables/" + firstPayable + "/void", map("voidDate", today())).status())
                .isEqualTo(200);

        JsonNode relinked = createLinkedPayable(supplierId, expenseId, "800.00");
        assertThat(relinked.path("id").asLong()).isNotEqualTo(firstPayable);
        assertThat(relinked.path("paymentStatus").asText()).isEqualTo("SETTLED");
        assertThat(count("SELECT COUNT(*) FROM pay_payable WHERE funded_expense_id = ?", expenseId)).isEqualTo(2);
        assertThat(count("SELECT COUNT(*) FROM pay_payable WHERE funded_expense_id = ? AND status = 'CONFIRMED'",
                expenseId)).isEqualTo(1);
    }

    @Test
    void concurrentDoubleLinkAllowsExactlyOne() throws Exception {
        long supplierId = seedSupplier("并发关联供应商");
        long accountId = seedAccount("并发关联账户", "BANK", "9000.00", today());
        long expenseId = createPurchaseExpense(accountId, "600.00");

        CyclicBarrier barrier = new CyclicBarrier(2);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            List<Callable<Integer>> tasks = List.of(
                    () -> {
                        barrier.await(10, TimeUnit.SECONDS);
                        return post("/api/v1/payable/payables", map(
                                "supplierId", supplierId, "bizDate", today(),
                                "accountingMonth", currentMonth(), "amount", "600.00",
                                "content", "并发关联A", "fundedExpenseId", expenseId,
                                "idempotencyKey", newIdempotencyKey())).status();
                    },
                    () -> {
                        barrier.await(10, TimeUnit.SECONDS);
                        return post("/api/v1/payable/payables", map(
                                "supplierId", supplierId, "bizDate", today(),
                                "accountingMonth", currentMonth(), "amount", "600.00",
                                "content", "并发关联B", "fundedExpenseId", expenseId,
                                "idempotencyKey", newIdempotencyKey())).status();
                    });
            List<Future<Integer>> futures = pool.invokeAll(tasks, 30, TimeUnit.SECONDS);
            int success = 0;
            for (Future<Integer> future : futures) {
                if (future.get() == 200) {
                    success++;
                }
            }
            assertThat(success).as("并发重复关联只允许一笔成功").isEqualTo(1);
        } finally {
            pool.shutdownNow();
        }
        assertThat(count("SELECT COUNT(*) FROM pay_payable WHERE funded_expense_id = ?", expenseId)).isEqualTo(1);
    }

    /* ------------------------------ 辅助 ------------------------------ */

    private long createPurchaseExpense(long accountId, String amount) throws Exception {
        HttpResult expense = post("/api/v1/treasury/expenses", map(
                "category", "PURCHASE",
                "content", "采购支出-" + amount,
                "payDate", today(),
                "accountId", accountId,
                "amount", amount,
                "idempotencyKey", newIdempotencyKey()));
        assertThat(expense.status()).as("创建采购支出应成功：%s", expense.body()).isEqualTo(200);
        return expense.data().path("id").asLong();
    }

    private JsonNode createLinkedPayable(long supplierId, long expenseId, String amount) throws Exception {
        HttpResult payable = post("/api/v1/payable/payables", map(
                "supplierId", supplierId,
                "bizDate", today(),
                "accountingMonth", currentMonth(),
                "amount", amount,
                "content", "关联采购支出",
                "fundedExpenseId", expenseId,
                "idempotencyKey", newIdempotencyKey()));
        assertThat(payable.status()).as("创建关联应付单应成功：%s", payable.body()).isEqualTo(200);
        return payable.data();
    }
}
