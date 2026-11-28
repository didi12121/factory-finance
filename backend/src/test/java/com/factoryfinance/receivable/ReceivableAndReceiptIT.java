package com.factoryfinance.receivable;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
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
 * 正式应收账款与回款核销集成测试（真实 MySQL）：
 * <ol>
 *   <li>确认应收单只登记债权（不产生资金流水、不增加资金余额）；</li>
 *   <li>一笔收款核销多张应收单：资金 +实收、应收 −核销、营业收入不重复增加；</li>
 *   <li>一张应收单分多次回款；超额/跨客户/未全额核销被拒绝且零变化；</li>
 *   <li>请求幂等（同键同参返回原单据，同键异参 409）；</li>
 *   <li>并发核销不超出应收单剩余余额；</li>
 *   <li>撤销收款：保留原单据与核销明细，反向流水恢复余额；有核销的应收单禁止直接撤销。</li>
 * </ol>
 */
class ReceivableAndReceiptIT extends Phase2TestSupport {

    @Test
    void confirmingReceivableDoesNotTouchFunds() throws Exception {
        long customerId = seedCustomer("确认客户");
        long accountId = account("应收确认账户", "1000.00");
        BigDecimal balanceBefore = rawBalance(accountId);

        JsonNode receivable = createReceivable(customerId, "8000.00");

        assertThat(rawBalance(accountId)).as("确认应收单不产生资金流水").isEqualByComparingTo(balanceBefore);
        assertThat(flowCount("RECEIVABLE", receivable.path("id").asLong())).isZero();
        assertThat(rawOutstanding(receivable.path("id").asLong())).isEqualByComparingTo("8000");
        assertThat(receivable.path("paymentStatus").asText()).isEqualTo("UNPAID");
    }

    @Test
    void receiptAllocatesAcrossTwoReceivablesAndKeepsIncomeOnce() throws Exception {
        long customerId = seedCustomer("核销客户");
        long accountId = account("核销账户", "0.00");
        JsonNode first = createReceivable(customerId, "8000.00");
        JsonNode second = createReceivable(customerId, "12000.00");

        BigDecimal confirmedBefore = confirmedTotal();

        HttpResult receipt = createReceipt(customerId, accountId, "15000.00", Map.of(
                first.path("id").asLong(), "8000.00",
                second.path("id").asLong(), "7000.00"));

        assertThat(receipt.status()).as("确认收款应成功：%s", receipt.body()).isEqualTo(200);
        long receiptId = receipt.data().path("id").asLong();

        // 资金余额 +15,000（一笔收款只一条资金流入）
        assertThat(rawBalance(accountId)).isEqualByComparingTo("15000");
        assertThat(flowCount("RECEIPT", receiptId)).isEqualTo(1);
        assertThat(receipt.data().path("allocations").size()).isEqualTo(2);

        // 应收余额：第一张结清、第二张剩余 5,000
        assertThat(rawOutstanding(first.path("id").asLong())).isEqualByComparingTo("0");
        assertThat(rawOutstanding(second.path("id").asLong())).isEqualByComparingTo("5000");

        // 营业收入（权责发生制应收合计）不因回款重复增加
        assertThat(confirmedTotal()).isEqualByComparingTo(confirmedBefore);
    }

    @Test
    void oneReceivableCanBeSettledByMultipleReceipts() throws Exception {
        long customerId = seedCustomer("分次客户");
        long accountId = account("分次账户", "0.00");
        JsonNode receivable = createReceivable(customerId, "10000.00");
        long receivableId = receivable.path("id").asLong();

        HttpResult first = createReceipt(customerId, accountId, "4000.00", Map.of(receivableId, "4000.00"));
        assertThat(first.status()).isEqualTo(200);
        assertThat(first.data().path("paymentStatus")).isNotNull();
        assertThat(rawOutstanding(receivableId)).isEqualByComparingTo("6000");

        HttpResult second = createReceipt(customerId, accountId, "6000.00", Map.of(receivableId, "6000.00"));
        assertThat(second.status()).isEqualTo(200);
        assertThat(rawOutstanding(receivableId)).isEqualByComparingTo("0");
        assertThat(rawBalance(accountId)).isEqualByComparingTo("10000");

        JsonNode detail = get("/api/v1/receivable/receivables/" + receivableId).data();
        assertThat(detail.path("paymentStatus").asText()).isEqualTo("SETTLED");
        assertThat(detail.path("overdue").asBoolean()).isFalse();
    }

    @Test
    void overAllocationCrossCustomerAndPartialAllocationRejected() throws Exception {
        long customerId = seedCustomer("校验客户");
        long otherCustomerId = seedCustomer("他客户");
        long accountId = account("校验账户", "0.00");
        long receivableId = createReceivable(customerId, "5000.00").path("id").asLong();
        long otherReceivableId = createReceivable(otherCustomerId, "3000.00").path("id").asLong();

        HttpResult over = createReceipt(customerId, accountId, "6000.00", Map.of(receivableId, "6000.00"));
        assertThat(over.status()).as("超额核销必须拒绝").isEqualTo(400);

        HttpResult cross = createReceipt(customerId, accountId, "3000.00", Map.of(otherReceivableId, "3000.00"));
        assertThat(cross.status()).as("跨客户核销必须拒绝").isEqualTo(400);

        HttpResult partial = createReceipt(customerId, accountId, "5000.00", Map.of(receivableId, "3000.00"));
        assertThat(partial.status()).as("未全额核销必须拒绝（本阶段不支持未分配收款）").isEqualTo(400);

        // 失败零变化
        assertThat(rawBalance(accountId)).isEqualByComparingTo("0");
        assertThat(rawOutstanding(receivableId)).isEqualByComparingTo("5000");
        assertThat(count("SELECT COUNT(*) FROM rcv_receipt WHERE account_id = ?", accountId)).isZero();
    }

    @Test
    void receiptIdempotencyByRequestKey() throws Exception {
        long customerId = seedCustomer("幂等客户");
        long accountId = account("幂等账户", "0.00");
        long receivableId = createReceivable(customerId, "2000.00").path("id").asLong();

        String key = newIdempotencyKey();
        Map<String, Object> body = map(
                "customerId", customerId,
                "receiptDate", today(),
                "accountId", accountId,
                "actualAmount", "2000.00",
                "allocations", List.of(Map.of("receivableId", receivableId, "amount", "2000.00")),
                "idempotencyKey", key);

        HttpResult first = post("/api/v1/receivable/receipts", body);
        HttpResult replay = post("/api/v1/receivable/receipts", body);
        assertThat(first.status()).isEqualTo(200);
        assertThat(replay.status()).as("同键同参重复提交返回原单据").isEqualTo(200);
        assertThat(replay.dataText("receiptNo")).isEqualTo(first.dataText("receiptNo"));
        assertThat(rawBalance(accountId)).isEqualByComparingTo("2000");
        assertThat(count("SELECT COUNT(*) FROM rcv_receipt WHERE customer_id = ?", customerId)).isEqualTo(1);

        HttpResult conflict = post("/api/v1/receivable/receipts", map(
                "customerId", customerId,
                "receiptDate", today(),
                "accountId", accountId,
                "actualAmount", "1999.00",
                "allocations", List.of(Map.of("receivableId", receivableId, "amount", "1999.00")),
                "idempotencyKey", key));
        assertThat(conflict.status()).as("同键异参必须拒绝").isEqualTo(409);
        assertThat(rawBalance(accountId)).isEqualByComparingTo("2000");
    }

    @Test
    void concurrentAllocationsNeverExceedRemainingBalance() throws Exception {
        long customerId = seedCustomer("并发客户");
        long accountId = account("并发账户", "0.00");
        long receivableId = createReceivable(customerId, "5000.00").path("id").asLong();

        CyclicBarrier barrier = new CyclicBarrier(2);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            List<Callable<HttpResult>> tasks = List.of(
                    () -> {
                        barrier.await(10, TimeUnit.SECONDS);
                        return createReceipt(customerId, accountId, "5000.00", Map.of(receivableId, "5000.00"));
                    },
                    () -> {
                        barrier.await(10, TimeUnit.SECONDS);
                        return createReceipt(customerId, accountId, "5000.00", Map.of(receivableId, "5000.00"));
                    });
            List<Future<HttpResult>> futures = pool.invokeAll(tasks, 30, TimeUnit.SECONDS);
            int success = 0;
            for (Future<HttpResult> future : futures) {
                if (future.get().status() == 200) {
                    success++;
                }
            }
            assertThat(success).as("并发核销同一应收单只允许一笔成功").isEqualTo(1);
        } finally {
            pool.shutdownNow();
        }

        assertThat(rawOutstanding(receivableId)).isEqualByComparingTo("0");
        assertThat(rawAllocated(receivableId)).isEqualByComparingTo("5000");
        assertThat(rawBalance(accountId)).isEqualByComparingTo("5000");
    }

    @Test
    void voidReceiptRestoresBalancesAndKeepsTrace() throws Exception {
        long customerId = seedCustomer("撤销客户");
        long accountId = account("撤销账户", "0.00");
        long receivableId = createReceivable(customerId, "3000.00").path("id").asLong();
        HttpResult receipt = createReceipt(customerId, accountId, "3000.00", Map.of(receivableId, "3000.00"));
        assertThat(receipt.status()).isEqualTo(200);
        long receiptId = receipt.data().path("id").asLong();

        HttpResult voidPayable = post("/api/v1/receivable/receivables/" + receivableId + "/void",
                map("voidDate", today(), "reason", "尝试撤销"));
        assertThat(voidPayable.status()).as("已有核销的应收单禁止直接撤销").isEqualTo(409);

        HttpResult voided = post("/api/v1/receivable/receipts/" + receiptId + "/void",
                map("voidDate", today(), "reason", "收款退回"));
        assertThat(voided.status()).as("撤销收款应成功：%s", voided.body()).isEqualTo(200);

        // 资金余额恢复；应收余额恢复；原单据与核销明细保留（REVERSED）
        assertThat(rawBalance(accountId)).isEqualByComparingTo("0");
        assertThat(rawOutstanding(receivableId)).isEqualByComparingTo("3000");
        assertThat(count("SELECT COUNT(*) FROM rcv_receipt WHERE id = ? AND status = 'VOIDED'", receiptId))
                .isEqualTo(1);
        assertThat(count("SELECT COUNT(*) FROM rcv_receipt_allocation WHERE receipt_id = ? AND status = 'REVERSED'",
                receiptId)).isEqualTo(1);

        HttpResult doubleVoid = post("/api/v1/receivable/receipts/" + receiptId + "/void",
                map("voidDate", today()));
        assertThat(doubleVoid.status()).as("重复撤销必须拒绝").isEqualTo(409);
    }

    @Test
    void futureAccountingMonthAndIllegalAmountRejected() throws Exception {
        long customerId = seedCustomer("日期客户");

        HttpResult future = post("/api/v1/receivable/receivables", map(
                "customerId", customerId,
                "accountingMonth", "2099-01",
                "statementDate", today(),
                "amount", "100.00",
                "idempotencyKey", newIdempotencyKey()));
        assertThat(future.status()).as("未来会计月份禁止提前确认收入").isEqualTo(400);

        HttpResult negative = post("/api/v1/receivable/receivables", map(
                "customerId", customerId,
                "accountingMonth", currentMonth(),
                "statementDate", today(),
                "amount", "-1.00",
                "idempotencyKey", newIdempotencyKey()));
        assertThat(negative.status()).isEqualTo(400);

        HttpResult missingKey = post("/api/v1/receivable/receivables", map(
                "customerId", customerId,
                "accountingMonth", currentMonth(),
                "statementDate", today(),
                "amount", "100.00",
                "idempotencyKey", ""));
        assertThat(missingKey.status()).as("缺少幂等键必须拒绝").isEqualTo(400);
    }

    /* ------------------------------ 内部辅助 ------------------------------ */

    private long account(String name, String opening) {
        try {
            return seedAccount(name, "BANK", opening, day(0));
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
    }

    private BigDecimal confirmedTotal() {
        return jdbcTemplate.queryForObject(
                "SELECT COALESCE(SUM(original_amount), 0) FROM rcv_receivable WHERE status = 'CONFIRMED'",
                BigDecimal.class);
    }


}
