package com.factoryfinance.modules.masterdata;

import com.fasterxml.jackson.databind.JsonNode;
import com.factoryfinance.AuthenticatedIntegrationTest;
import com.factoryfinance.modules.identity.infrastructure.AdminBootstrapProperties;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;

import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 股东管理集成测试：CRUD、编号唯一/409、分页筛选、必填校验、停用保留（真实 MySQL）。
 */
class ShareholderIT extends AuthenticatedIntegrationTest {

    @Autowired
    private AdminBootstrapProperties adminBootstrapProperties;

    private String adminToken;

    @Test
    void create_generates_sh_number_and_supports_explicit_number() throws Exception {
        JsonNode created = createShareholder(uniqueMarker("股东-编号格式"), null, null);
        assertThat(created.get("shareholderNo").asText()).matches("SH-[0-9]{4,}");
        assertThat(created.get("status").asText()).isEqualTo("ENABLED");

        // 显式编号
        Map<String, Object> body = new HashMap<>();
        body.put("shareholderNo", "SH-9001");
        body.put("name", uniqueMarker("股东-显式编号"));
        MvcResult explicit = mockMvc.perform(post("/api/v1/masterdata/shareholders")
                        .header("Authorization", token())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.shareholderNo").value("SH-9001"))
                .andReturn();
        assertThat(readTree(explicit).get("data").get("id").asLong()).isPositive();
    }

    @Test
    void duplicate_explicit_number_returns_409_conflict() throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("shareholderNo", "SH-9002");
        body.put("name", uniqueMarker("股东-重复编号"));

        mockMvc.perform(post("/api/v1/masterdata/shareholders")
                        .header("Authorization", token())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/v1/masterdata/shareholders")
                        .header("Authorization", token())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CONFLICT"));
    }

    @Test
    void update_and_disable_keeps_record() throws Exception {
        String marker = uniqueMarker("股东-更新");
        JsonNode created = createShareholder(marker, "13800000001", "初始备注");
        long id = created.get("id").asLong();

        Map<String, Object> update = new HashMap<>();
        update.put("name", marker + "-改");
        update.put("contact", null);
        update.put("remark", "更新备注");
        update.put("status", "DISABLED");
        mockMvc.perform(put("/api/v1/masterdata/shareholders/" + id)
                        .header("Authorization", token())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(update)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.shareholderNo").value(created.get("shareholderNo").asText()))
                .andExpect(jsonPath("$.data.name").value(marker + "-改"))
                .andExpect(jsonPath("$.data.status").value("DISABLED"));

        // 停用保留
        mockMvc.perform(get("/api/v1/masterdata/shareholders")
                        .header("Authorization", token())
                        .param("keyword", marker)
                        .param("status", "DISABLED"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.total").value(1))
                .andExpect(jsonPath("$.data.items[0].name").value(marker + "-改"));
    }

    @Test
    void update_unknown_id_returns_404() throws Exception {
        mockMvc.perform(put("/api/v1/masterdata/shareholders/999999999")
                        .header("Authorization", token())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"不存在的股东\"}"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("NOT_FOUND"));
    }

    @Test
    void create_without_name_returns_field_validation_error() throws Exception {
        mockMvc.perform(post("/api/v1/masterdata/shareholders")
                        .header("Authorization", token())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.data.fieldErrors.name").value("名称不能为空"));
    }

    @Test
    void pagination_and_keyword_filter() throws Exception {
        String marker = uniqueMarker("股东-分页");
        createShareholder(marker + "-A", null, null);
        createShareholder(marker + "-B", null, null);
        createShareholder(marker + "-C", null, null);

        mockMvc.perform(get("/api/v1/masterdata/shareholders")
                        .header("Authorization", token())
                        .param("keyword", marker)
                        .param("page", "1")
                        .param("size", "2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.total").value(3))
                .andExpect(jsonPath("$.data.items.length()").value(2));

        mockMvc.perform(get("/api/v1/masterdata/shareholders")
                        .header("Authorization", token())
                        .param("keyword", marker)
                        .param("page", "2")
                        .param("size", "2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items.length()").value(1));
    }

    @Test
    void shareholders_api_requires_authentication() throws Exception {
        mockMvc.perform(get("/api/v1/masterdata/shareholders"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
    }

    private JsonNode createShareholder(String name, String contact, String remark) throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("name", name);
        body.put("contact", contact);
        body.put("remark", remark);
        MvcResult result = mockMvc.perform(post("/api/v1/masterdata/shareholders")
                        .header("Authorization", token())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andReturn();
        return readTree(result).get("data");
    }

    private String token() throws Exception {
        if (adminToken == null) {
            adminToken = login("admin", adminBootstrapProperties.getInitialPassword());
        }
        return bearer(adminToken);
    }
}
