package com.factoryfinance.treasury;

import com.factoryfinance.AbstractIntegrationTest;
import com.factoryfinance.infrastructure.security.JwtService;
import com.factoryfinance.infrastructure.time.BusinessTime;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * 资金业务集成测试基座：
 * Bearer JWT 经真实 {@link JwtService} 签发（认证链路与正式一致）；
 * 余额断言使用独立 SQL 重算（期初 + 有效流水），不依赖被测代码的查询实现。
 */
public abstract class TreasuryTestSupport extends AbstractIntegrationTest {

    @Autowired
    protected JwtService jwtService;

    @Autowired
    protected ObjectMapper objectMapper;

    @Autowired
    protected BusinessTime businessTime;

    /** 统一 HTTP 结果（状态码 + 解析后的响应体） */
    protected record HttpResult(int status, JsonNode body) {

        public String code() {
            return body.path("code").asText();
        }

        public JsonNode data() {
            return body.path("data");
        }

        public String dataText(String field) {
            return data().path(field).asText(null);
        }
    }

    protected String authHeader() {
        return "Bearer " + jwtService.generateToken("treasury-tester", Map.of("name", "资金测试员"));
    }

    /** 业务日期（Asia/Shanghai），daysAgo=0 为今天 */
    protected String day(int daysAgo) {
        return businessTime.today().minusDays(daysAgo).toString();
    }

    protected HttpResult post(String path, Object body) throws Exception {
        return perform(MockMvcRequestBuilders.post(path), withIdempotencyKey(body), Map.of());
    }

    protected HttpResult put(String path, Object body) throws Exception {
        return perform(MockMvcRequestBuilders.put(path), body, Map.of());
    }

    protected HttpResult get(String path) throws Exception {
        return perform(MockMvcRequestBuilders.get(path), null, Map.of());
    }

    protected HttpResult get(String path, Map<String, String> params) throws Exception {
        return perform(MockMvcRequestBuilders.get(path), null, params);
    }

    private HttpResult perform(MockHttpServletRequestBuilder builder, Object body,
                               Map<String, String> params) throws Exception {
        builder.header("Authorization", authHeader());
        if (body != null) {
            builder.contentType(MediaType.APPLICATION_JSON)
                    .content(objectMapper.writeValueAsString(body));
        }
        params.forEach(builder::param);
        MvcResult result = mockMvc.perform(builder).andReturn();
        String content = result.getResponse().getContentAsString(StandardCharsets.UTF_8);
        JsonNode node = content == null || content.isBlank()
                ? objectMapper.createObjectNode()
                : objectMapper.readTree(content);
        return new HttpResult(result.getResponse().getStatus(), node);
    }

    /** 构造请求体 Map（保持字段顺序） */
    protected static Map<String, Object> map(Object... kv) {
        Map<String, Object> result = new LinkedHashMap<>();
        for (int i = 0; i + 1 < kv.length; i += 2) {
            if (kv[i + 1] != null) {
                result.put(String.valueOf(kv[i]), kv[i + 1]);
            }
        }
        return result;
    }

    /**
     * 业务创建请求自动补幂等键（模拟前端每次独立操作生成的稳定键）；
     * 需要显式控制幂等键的用例自行在 body 中传入。
     */
    private static Object withIdempotencyKey(Object body) {
        if (body instanceof Map<?, ?> source && !source.containsKey("idempotencyKey")) {
            Map<String, Object> copy = new LinkedHashMap<>();
            source.forEach((key, value) -> copy.put(String.valueOf(key), value));
            copy.put("idempotencyKey", newIdempotencyKey());
            return copy;
        }
        return body;
    }

    /** 生成一个合法幂等键（8-96 位字母/数字/下划线/短横线） */
    protected static String newIdempotencyKey() {
        return "it-" + UUID.randomUUID();
    }

    /** 金额断言：十进制字符串按数值比较 */
    protected static BigDecimal dec(String value) {
        return new BigDecimal(value);
    }

    /** 种子数据：股东（mst_shareholder，仅测试夹具） */
    protected long seedShareholder(String name, String status) {
        String no = "SH-" + UUID.randomUUID().toString().replace("-", "").substring(0, 10).toUpperCase();
        jdbcTemplate.update("INSERT INTO mst_shareholder (shareholder_no, name, status) VALUES (?, ?, ?)",
                no, name, status);
        return jdbcTemplate.queryForObject("SELECT id FROM mst_shareholder WHERE shareholder_no = ?",
                Long.class, no);
    }

    /** 种子数据：资金账户（断言创建成功，失败即终止测试避免级联误报） */
    protected long seedAccount(String name, String accountType, String openingBalance, String openingDate)
            throws Exception {
        HttpResult result = post("/api/v1/treasury/accounts", map(
                "name", name, "accountType", accountType,
                "openingBalance", openingBalance, "openingDate", openingDate));
        org.assertj.core.api.Assertions.assertThat(result.status())
                .as("创建资金账户 %s 应成功", name).isEqualTo(200);
        return result.data().path("id").asLong();
    }

    /** 独立 SQL 重算余额：期初 + ΣIN − ΣOUT（全部 RECORDED 流水） */
    protected BigDecimal rawBalance(long accountId) {
        return jdbcTemplate.queryForObject("""
                SELECT a.opening_balance
                       + COALESCE(SUM(CASE WHEN t.direction = 'IN' THEN t.amount ELSE -t.amount END), 0)
                FROM tst_fund_account a
                LEFT JOIN tst_fund_transaction t ON t.account_id = a.id AND t.status = 'RECORDED'
                WHERE a.id = ?
                GROUP BY a.id
                """, BigDecimal.class, accountId);
    }

    /** 独立 SQL 重算多账户合计余额 */
    protected BigDecimal rawTotalBalance() {
        return jdbcTemplate.queryForObject("""
                SELECT COALESCE(SUM(opening), 0) FROM (
                    SELECT a.opening_balance
                           + COALESCE((SELECT SUM(CASE WHEN t.direction = 'IN' THEN t.amount ELSE -t.amount END)
                                       FROM tst_fund_transaction t
                                       WHERE t.account_id = a.id AND t.status = 'RECORDED'), 0) AS opening
                    FROM tst_fund_account a
                ) x
                """, BigDecimal.class);
    }

    /** 指定来源单据的流水条数（幂等断言） */
    protected int flowCount(String sourceDocType, long sourceDocId) {
        Integer count = jdbcTemplate.queryForObject("""
                SELECT COUNT(*) FROM tst_fund_transaction
                WHERE source_doc_type = ? AND source_doc_id = ?
                """, Integer.class, sourceDocType, sourceDocId);
        return count == null ? 0 : count;
    }
}
