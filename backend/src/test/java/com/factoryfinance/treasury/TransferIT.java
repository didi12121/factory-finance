package com.factoryfinance.treasury;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 内部转账：一单两流水（from OUT + to IN）净零、from≠to、失败双方余额不变、撤销后净零恢复。
 * 业务日期取 T-3。
 */
class TransferIT extends TreasuryTestSupport {

    @Test
    void transferCreatesPairedFlowsWithZeroNetChange() throws Exception {
        long bankId = seedAccount("转账银行账户", "BANK", "5000.00", day(3));
        long pettyId = seedAccount("转账备用金", "CASH", "0.00", day(3));

        HttpResult created = post("/api/v1/treasury/transfers", map(
                "transferDate", day(3), "fromAccountId", bankId,
                "toAccountId", pettyId, "amount", "1000.00", "remark", "备用金调拨"));
        assertThat(created.status()).isEqualTo(200);
        long docId = created.data().path("id").asLong();
        String docNo = created.dataText("docNo");
        assertThat(docNo).startsWith("ZZ-");

        // 成对流水：from OUT + to IN，同 transfer_group_id = doc_no
        assertThat(flowCount("TRANSFER", docId)).isEqualTo(2);
        Map<String, Object> outFlow = jdbcTemplate.queryForMap("""
                SELECT account_id, direction, transfer_group_id FROM tst_fund_transaction
                WHERE source_doc_type = 'TRANSFER' AND source_doc_id = ? AND direction = 'OUT'
                """, docId);
        Map<String, Object> inFlow = jdbcTemplate.queryForMap("""
                SELECT account_id, direction, transfer_group_id FROM tst_fund_transaction
                WHERE source_doc_type = 'TRANSFER' AND source_doc_id = ? AND direction = 'IN'
                """, docId);
        assertThat(((Number) outFlow.get("account_id")).longValue()).isEqualTo(bankId);
        assertThat(((Number) inFlow.get("account_id")).longValue()).isEqualTo(pettyId);
        assertThat(outFlow.get("transfer_group_id")).isEqualTo(docNo);
        assertThat(inFlow.get("transfer_group_id")).isEqualTo(docNo);

        // 分布变化、整体净变化为 0
        assertThat(rawBalance(bankId)).isEqualByComparingTo("4000");
        assertThat(rawBalance(pettyId)).isEqualByComparingTo("1000");
        assertThat(rawBalance(bankId).add(rawBalance(pettyId))).isEqualByComparingTo("5000");
    }

    @Test
    void sameAccountAndInvalidAmountRejected() throws Exception {
        long accountId = seedAccount("转账校验账户", "BANK", "100.00", day(3));

        HttpResult same = post("/api/v1/treasury/transfers", map(
                "transferDate", day(3), "fromAccountId", accountId,
                "toAccountId", accountId, "amount", "10.00"));
        assertThat(same.status()).isEqualTo(400);
        assertThat(same.code()).isEqualTo("VALIDATION_ERROR");
        assertThat(same.body().toString()).contains("不能相同");

        HttpResult badAmount = post("/api/v1/treasury/transfers", map(
                "transferDate", day(3), "fromAccountId", accountId,
                "toAccountId", accountId + 1, "amount", "1.234"));
        assertThat(badAmount.status()).isEqualTo(400);
    }

    @Test
    void failedTransferLeavesBothBalancesUnchanged() throws Exception {
        long fromId = seedAccount("转账失败-转出", "BANK", "800.00", day(3));
        long toId = seedAccount("转账失败-转入", "BANK", "200.00", day(3));

        // 转入账户停用 → 整单失败
        assertThat(put("/api/v1/treasury/accounts", map("id", toId, "status", "DISABLED")).status())
                .isEqualTo(200);

        HttpResult failed = post("/api/v1/treasury/transfers", map(
                "transferDate", day(3), "fromAccountId", fromId,
                "toAccountId", toId, "amount", "300.00"));
        assertThat(failed.status()).isEqualTo(400);

        // 双方余额不变、无任何流水产生
        assertThat(rawBalance(fromId)).isEqualByComparingTo("800");
        assertThat(rawBalance(toId)).isEqualByComparingTo("200");
        Integer flows = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM tst_fund_transaction WHERE account_id IN (?, ?)", Integer.class, fromId, toId);
        assertThat(flows).isEqualTo(0);
    }

    @Test
    void voidTransferCreatesReversalPairAndRestoresBalances() throws Exception {
        long fromId = seedAccount("转账撤销-转出", "BANK", "1000.00", day(3));
        long toId = seedAccount("转账撤销-转入", "CASH", "0.00", day(3));

        HttpResult created = post("/api/v1/treasury/transfers", map(
                "transferDate", day(3), "fromAccountId", fromId,
                "toAccountId", toId, "amount", "400.00"));
        long docId = created.data().path("id").asLong();
        assertThat(rawBalance(fromId)).isEqualByComparingTo("600");
        assertThat(rawBalance(toId)).isEqualByComparingTo("400");

        HttpResult voided = post("/api/v1/treasury/transfers/" + docId + "/void", map(
                "voidDate", day(3), "reason", "转账撤回"));
        assertThat(voided.status()).isEqualTo(200);
        assertThat(voided.data().path("reverseTransactionIds").size()).isEqualTo(2);

        // 两条反向流水 + 原成对流水，账户恢复
        assertThat(flowCount("VOID", voided.data().path("id").asLong())).isEqualTo(2);
        assertThat(rawBalance(fromId)).isEqualByComparingTo("1000");
        assertThat(rawBalance(toId)).isEqualByComparingTo("0");

        // 整体净变化始终为 0
        BigDecimal total = rawBalance(fromId).add(rawBalance(toId));
        assertThat(total).isEqualByComparingTo("1000");

        // 重复撤销 409
        HttpResult again = post("/api/v1/treasury/transfers/" + docId + "/void", map("voidDate", day(3)));
        assertThat(again.status()).isEqualTo(409);
        assertThat(again.code()).isEqualTo("CONFLICT");
    }
}
