package com.factoryfinance.treasury;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 资金流水查询：分页 + 关键字/日期/账户/类型/方向筛选；source 单据类型与撤销关联可追溯。
 * 业务日期取 T-5。
 */
class TransactionQueryIT extends TreasuryTestSupport {

    private long shareholderId;
    private long accountId;
    private long peerAccountId;

    private void seedScenario() throws Exception {
        shareholderId = seedShareholder("流水查询股东", "ENABLED");
        accountId = seedAccount("流水查询账户", "BANK", "0.00", day(5));
        peerAccountId = seedAccount("流水查询对端账户", "CASH", "0.00", day(5));

        assertThat(post("/api/v1/treasury/contributions", map(
                "shareholderId", shareholderId, "contributionDate", day(5),
                "accountId", accountId, "amount", "10000.00")).status()).isEqualTo(200);
        HttpResult expense = post("/api/v1/treasury/expenses", map(
                "category", "PURCHASE", "content", "购买原料A",
                "payDate", day(5), "accountId", accountId, "amount", "500.00",
                "payee", "供应商乙", "remark", "购买原料A批次"));
        assertThat(expense.status()).isEqualTo(200);
        HttpResult transfer = post("/api/v1/treasury/transfers", map(
                "transferDate", day(5), "fromAccountId", accountId,
                "toAccountId", peerAccountId, "amount", "100.00"));
        assertThat(transfer.status()).isEqualTo(200);
        // 撤销该支出，验证撤销关联
        HttpResult voided = post("/api/v1/treasury/expenses/"
                + expense.data().path("id").asLong() + "/void",
                map("voidDate", day(5), "reason", "采购取消"));
        assertThat(voided.status()).isEqualTo(200);
    }

    @Test
    void filtersPagingAndVoidLinkage() throws Exception {
        seedScenario();

        Map<String, String> dayFilter = new HashMap<>();
        dayFilter.put("dateFrom", day(5));
        dayFilter.put("dateTo", day(5));
        dayFilter.put("size", "50");
        HttpResult all = get("/api/v1/treasury/transactions", dayFilter);
        assertThat(all.status()).isEqualTo(200);
        JsonNode items = all.data().path("items");

        // 全部 5 条：出资 IN + 支出 OUT + 转账 OUT + 转账 IN + 撤销反向 IN
        assertThat(all.data().path("total").asLong()).isEqualTo(5);
        int contributionIn = 0;
        int expenseOut = 0;
        int reversalIn = 0;
        Map<String, JsonNode> byType = new HashMap<>();
        for (JsonNode item : items) {
            String sourceType = item.path("sourceDocType").asText();
            byType.put(sourceType + ":" + item.path("direction").asText(), item);
            if ("CONTRIBUTION".equals(sourceType) && "IN".equals(item.path("direction").asText())) {
                contributionIn++;
            }
            if ("EXPENSE".equals(sourceType) && "OUT".equals(item.path("direction").asText())) {
                expenseOut++;
                // 被撤销的原流水保留业务事实，携带撤销关联
                assertThat(item.path("voidNo").asText()).startsWith("VN-");
                assertThat(item.path("voidDate").asText()).isEqualTo(day(5));
                assertThat(item.path("sourceDocNo").asText()).startsWith("ZC-");
                assertThat(item.path("status").asText()).isEqualTo("RECORDED");
            }
            if ("VOID".equals(sourceType)) {
                reversalIn++;
                assertThat(item.path("direction").asText()).isEqualTo("IN");
                assertThat(item.path("voidNo").asText()).startsWith("VN-");
                assertThat(item.path("amount").asText()).isEqualTo("500.00");
                assertThat(item.path("tradeDate").asText()).isEqualTo(day(5));
            }
        }
        assertThat(contributionIn).isEqualTo(1);
        assertThat(expenseOut).isEqualTo(1);
        assertThat(reversalIn).isEqualTo(1);

        // 方向筛选：出资 IN + 转账 IN + 撤销反向 IN = 3
        Map<String, String> inFilter = new HashMap<>(dayFilter);
        inFilter.put("direction", "IN");
        HttpResult inOnly = get("/api/v1/treasury/transactions", inFilter);
        for (JsonNode item : inOnly.data().path("items")) {
            assertThat(item.path("direction").asText()).isEqualTo("IN");
        }
        assertThat(inOnly.data().path("total").asLong()).isEqualTo(3);

        // 类型筛选
        Map<String, String> voidFilter = new HashMap<>(dayFilter);
        voidFilter.put("type", "VOID");
        HttpResult voidOnly = get("/api/v1/treasury/transactions", voidFilter);
        assertThat(voidOnly.data().path("total").asLong()).isEqualTo(1);
        assertThat(voidOnly.data().path("items").get(0).path("sourceDocType").asText()).isEqualTo("VOID");

        // 关键字筛选（流水 remark/counterparty/no）
        Map<String, String> keywordFilter = new HashMap<>(dayFilter);
        keywordFilter.put("keyword", "购买原料A批次");
        HttpResult keyword = get("/api/v1/treasury/transactions", keywordFilter);
        assertThat(keyword.data().path("total").asLong()).isEqualTo(1);
        assertThat(keyword.data().path("items").get(0).path("amount").asText()).isEqualTo("500.00");

        // 账户筛选 + 分页
        Map<String, String> paged = new HashMap<>(dayFilter);
        paged.put("accountId", String.valueOf(accountId));
        paged.put("size", "2");
        paged.put("page", "1");
        HttpResult page1 = get("/api/v1/treasury/transactions", paged);
        assertThat(page1.data().path("items").size()).isEqualTo(2);
        assertThat(page1.data().path("total").asLong()).isEqualTo(4);

        // 非法筛选参数 → VALIDATION_ERROR
        Map<String, String> bad = new HashMap<>(dayFilter);
        bad.put("direction", "SOMETHING");
        HttpResult badResult = get("/api/v1/treasury/transactions", bad);
        assertThat(badResult.status()).isEqualTo(400);
        assertThat(badResult.code()).isEqualTo("VALIDATION_ERROR");
    }
}
