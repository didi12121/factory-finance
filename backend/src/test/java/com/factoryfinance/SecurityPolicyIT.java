package com.factoryfinance;

import org.junit.jupiter.api.Test;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 基础安全策略测试：默认拒绝未认证访问，统一 401 JSON 响应。
 */
class SecurityPolicyIT extends AbstractIntegrationTest {

    @Test
    void protected_api_requires_authentication() throws Exception {
        mockMvc.perform(get("/api/v1/treasury/accounts"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
    }

    @Test
    void unknown_protected_api_still_requires_authentication() throws Exception {
        mockMvc.perform(get("/api/v1/does-not-exist"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
    }

    @Test
    void options_preflight_is_permitted() throws Exception {
        mockMvc.perform(options("/api/v1/health"))
                .andExpect(status().isOk());
    }

    @Test
    void health_endpoint_is_public() throws Exception {
        mockMvc.perform(get("/api/v1/health"))
                .andExpect(status().isOk());
    }
}
