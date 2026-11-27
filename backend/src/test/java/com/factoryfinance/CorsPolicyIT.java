package com.factoryfinance;

import org.junit.jupiter.api.Test;

import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * CORS 行为测试（真实 Spring 上下文）：仅允许配置来源，禁止全局无限制 CORS。
 * 允许来源回显具体 Origin（等值断言即证明非通配符 *）。
 */
class CorsPolicyIT extends AbstractIntegrationTest {

    private static final String ALLOWED_ORIGIN = "http://localhost:5173";
    private static final String DENIED_ORIGIN = "http://evil.example";

    @Test
    void preflight_from_allowed_origin_is_accepted() throws Exception {
        mockMvc.perform(options("/api/v1/health")
                        .header("Origin", ALLOWED_ORIGIN)
                        .header("Access-Control-Request-Method", "GET"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", ALLOWED_ORIGIN));
    }

    @Test
    void preflight_from_denied_origin_gets_no_cors_headers() throws Exception {
        mockMvc.perform(options("/api/v1/health")
                        .header("Origin", DENIED_ORIGIN)
                        .header("Access-Control-Request-Method", "GET"))
                .andExpect(header().string("Access-Control-Allow-Origin", nullValue()));
    }

    @Test
    void actual_request_from_allowed_origin_echoes_concrete_origin() throws Exception {
        mockMvc.perform(get("/api/v1/health").header("Origin", ALLOWED_ORIGIN))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", ALLOWED_ORIGIN))
                .andExpect(header().exists("X-Trace-Id"));
    }

    @Test
    void actual_request_from_denied_origin_is_rejected_without_cors_headers() throws Exception {
        // Spring Security 对未允许来源的真实跨域请求默认拒绝（403）且不输出 CORS 头
        mockMvc.perform(get("/api/v1/health").header("Origin", DENIED_ORIGIN))
                .andExpect(status().isForbidden())
                .andExpect(header().string("Access-Control-Allow-Origin", nullValue()));
    }
}
