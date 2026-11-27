package com.factoryfinance.treasury;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 股东出资：IN 流水、股东启用校验、金额/日期校验、撤销与重复撤销、追溯。
 * 业务日期取 T-1（与其他测试类互不干扰）。
 */
class ContributionIT extends TreasuryTestSupport {

    @Test
    void contributionCreatesInFlowAndBalanceRecomputes() throws Exception {
        long shareholderId = seedShareholder("出资股东A", "ENABLED");
        long accountId = seedAccount("出资接收账户", "BANK", "0.00", day(1));

        HttpResult created = post("/api/v1/treasury/contributions", map(
                "shareholderId", shareholderId,
                "contributionDate", day(1),
                "accountId", accountId,
                "amount", "10000.00",
                "remark", "首期出资"));
        assertThat(created.status()).isEqualTo(200);
        assertThat(created.code()).isEqualTo("SUCCESS");
        long docId = created.data().path("id").asLong();
        assertThat(created.dataText("amount")).isEqualTo("10000.00");
        assertThat(created.dataText("docNo")).startsWith("CZ-");
        assertThat(created.dataText("status")).isEqualTo("CONFIRMED");

        // 单据 + 流水同事务：1 单据 1 条 IN 流水
        Integer docCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM tst_shareholder_contribution WHERE id = ?", Integer.class, docId);
        assertThat(docCount).isEqualTo(1);
        assertThat(flowCount("CONTRIBUTION", docId)).isEqualTo(1);
        String direction = jdbcTemplate.queryForObject(
                "SELECT direction FROM tst_fund_transaction WHERE source_doc_type = 'CONTRIBUTION' AND source_doc_id = ?",
                String.class, docId);
        assertThat(direction).isEqualTo("IN");
        assertThat(rawBalance(accountId)).isEqualByComparingTo("10000");
    }

    @Test
    void shareholderMustExistAndBeEnabled() throws Exception {
        long accountId = seedAccount("出资校验账户", "BANK", "0.00", day(1));

        HttpResult missing = post("/api/v1/treasury/contributions", map(
                "shareholderId", 999999999L, "contributionDate", day(1),
                "accountId", accountId, "amount", "100.00"));
        assertThat(missing.status()).isEqualTo(404);
        assertThat(missing.code()).isEqualTo("NOT_FOUND");

        long disabledId = seedShareholder("停用股东B", "DISABLED");
        HttpResult disabled = post("/api/v1/treasury/contributions", map(
                "shareholderId", disabledId, "contributionDate", day(1),
                "accountId", accountId, "amount", "100.00"));
        assertThat(disabled.status()).isEqualTo(400);
        assertThat(disabled.code()).isEqualTo("VALIDATION_ERROR");
        assertThat(disabled.body().toString()).contains("已停用");
    }

    @Test
    void invalidAmountAndDateRejected() throws Exception {
        long shareholderId = seedShareholder("出资校验股东C", "ENABLED");
        long accountId = seedAccount("出资非法参数账户", "BANK", "0.00", day(1));

        for (String badAmount : new String[]{"1.234", "1e3", "0", "-5", "abc", "99999999999999999.00", ""}) {
            HttpResult bad = post("/api/v1/treasury/contributions", map(
                    "shareholderId", shareholderId, "contributionDate", day(1),
                    "accountId", accountId, "amount", badAmount));
            assertThat(bad.status()).as("amount=%s 应拒绝", badAmount).isEqualTo(400);
            assertThat(bad.code()).as("amount=%s 应为 VALIDATION_ERROR", badAmount)
                    .isEqualTo("VALIDATION_ERROR");
        }

        // 未来日期
        HttpResult future = post("/api/v1/treasury/contributions", map(
                "shareholderId", shareholderId,
                "contributionDate", businessTime.today().plusDays(1).toString(),
                "accountId", accountId, "amount", "100.00"));
        assertThat(future.status()).isEqualTo(400);
        assertThat(future.code()).isEqualTo("VALIDATION_ERROR");

        // 非法日期格式
        HttpResult badDate = post("/api/v1/treasury/contributions", map(
                "shareholderId", shareholderId, "contributionDate", "2026-02-30",
                "accountId", accountId, "amount", "100.00"));
        assertThat(badDate.status()).isEqualTo(400);
    }

    @Test
    void voidContributionKeepsRecordsCreatesReversalAndDoubleVoid409() throws Exception {
        long shareholderId = seedShareholder("撤销出资股东D", "ENABLED");
        long accountId = seedAccount("撤销出资账户", "BANK", "2000.00", day(1));

        HttpResult created = post("/api/v1/treasury/contributions", map(
                "shareholderId", shareholderId, "contributionDate", day(1),
                "accountId", accountId, "amount", "3000.00"));
        long docId = created.data().path("id").asLong();
        String docNo = created.dataText("docNo");
        assertThat(rawBalance(accountId)).isEqualByComparingTo("5000");

        HttpResult voided = post("/api/v1/treasury/contributions/" + docId + "/void", map(
                "voidDate", day(1), "reason", "出资撤回"));
        assertThat(voided.status()).isEqualTo(200);
        assertThat(voided.dataText("voidNo")).startsWith("VN-");
        assertThat(voided.data().path("reverseTransactionIds").size()).isEqualTo(1);

        // 撤销后余额回滚 + 与独立重算一致
        assertThat(rawBalance(accountId)).isEqualByComparingTo("2000");
        HttpResult accounts = get("/api/v1/treasury/accounts", Map.of("size", "100"));
        for (JsonNode item : accounts.data().path("items")) {
            if (item.path("id").asLong() == accountId) {
                assertThat(dec(item.path("currentBalance").asText())).isEqualByComparingTo("2000");
            }
        }

        // 原单据保留（VOIDED + void_record_id）+ 原流水保留 + 反向流水（方向相反、金额相同）
        String docStatus = jdbcTemplate.queryForObject(
                "SELECT status FROM tst_shareholder_contribution WHERE id = ?", String.class, docId);
        assertThat(docStatus).isEqualTo("VOIDED");
        assertThat(flowCount("CONTRIBUTION", docId)).isEqualTo(1);
        assertThat(flowCount("VOID", voided.data().path("id").asLong())).isEqualTo(1);
        BigDecimal reversal = jdbcTemplate.queryForObject("""
                SELECT amount FROM tst_fund_transaction
                WHERE source_doc_type = 'VOID' AND source_doc_id = ? AND direction = 'OUT'
                """, BigDecimal.class, voided.data().path("id").asLong());
        assertThat(reversal).isEqualByComparingTo("3000");

        // 重复撤销 → 409
        HttpResult again = post("/api/v1/treasury/contributions/" + docId + "/void", map(
                "voidDate", day(1)));
        assertThat(again.status()).isEqualTo(409);
        assertThat(again.code()).isEqualTo("CONFLICT");

        // 已撤销可查询追溯
        HttpResult list = get("/api/v1/treasury/contributions", mapOfStatusVoided());
        boolean found = false;
        for (JsonNode item : list.data().path("items")) {
            if (item.path("id").asLong() == docId) {
                found = true;
                assertThat(item.path("status").asText()).isEqualTo("VOIDED");
                assertThat(item.path("docNo").asText()).isEqualTo(docNo);
                assertThat(item.path("voidNo").asText()).startsWith("VN-");
                assertThat(item.path("voidDate").asText()).isEqualTo(day(1));
            }
        }
        assertThat(found).as("已撤销出资单应可查询").isTrue();
    }

    private static Map<String, String> mapOfStatusVoided() {
        return Map.of("status", "VOIDED", "size", "50");
    }
}
