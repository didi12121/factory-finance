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
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 客户管理集成测试：CRUD、编号唯一/409、分页筛选、必填校验、停用保留（真实 MySQL）。
 */
class CustomerIT extends AuthenticatedIntegrationTest {

    @Autowired
    private AdminBootstrapProperties adminBootstrapProperties;

    private String adminToken;

    @Test
    void create_generates_deterministic_cus_number_format() throws Exception {
        JsonNode created = createCustomer(uniqueMarker("客户-编号格式"), null, null);

        assertThat(created.get("customerNo").asText()).matches("CUS-[0-9]{4,}");
        assertThat(created.get("status").asText()).isEqualTo("ENABLED");
        assertThat(created.get("name").asText()).isNotBlank();
    }

    @Test
    void generated_numbers_are_unique_across_creates() throws Exception {
        JsonNode first = createCustomer(uniqueMarker("客户-唯一1"), null, null);
        JsonNode second = createCustomer(uniqueMarker("客户-唯一2"), null, null);

        assertThat(first.get("customerNo").asText()).matches("CUS-[0-9]{4,}");
        assertThat(second.get("customerNo").asText()).matches("CUS-[0-9]{4,}");
        assertThat(first.get("customerNo").asText()).isNotEqualTo(second.get("customerNo").asText());
    }

    @Test
    void duplicate_explicit_number_returns_409_conflict() throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("customerNo", "CUS-9001");
        body.put("name", uniqueMarker("客户-重复编号"));

        mockMvc.perform(post("/api/v1/masterdata/customers")
                        .header("Authorization", token())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.customerNo").value("CUS-9001"));

        mockMvc.perform(post("/api/v1/masterdata/customers")
                        .header("Authorization", token())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CONFLICT"));
    }

    @Test
    void update_fields_and_disable_keeps_record() throws Exception {
        String marker = uniqueMarker("客户-更新");
        JsonNode created = createCustomer(marker, "13800000000", "初始备注");
        long id = created.get("id").asLong();

        // 更新字段（业务编号不可变）
        Map<String, Object> update = new HashMap<>();
        update.put("name", marker + "-改");
        update.put("contact", "13900000000");
        update.put("remark", "更新备注");
        update.put("status", "DISABLED");
        mockMvc.perform(put("/api/v1/masterdata/customers/" + id)
                        .header("Authorization", token())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(update)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.customerNo").value(created.get("customerNo").asText()))
                .andExpect(jsonPath("$.data.name").value(marker + "-改"))
                .andExpect(jsonPath("$.data.contact").value("13900000000"))
                .andExpect(jsonPath("$.data.status").value("DISABLED"));

        // 停用保留：记录仍可查询，状态为 DISABLED（不提供删除，被引用保护）
        mockMvc.perform(get("/api/v1/masterdata/customers")
                        .header("Authorization", token())
                        .param("keyword", marker)
                        .param("status", "DISABLED"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.total").value(1))
                .andExpect(jsonPath("$.data.items[0].name").value(marker + "-改"))
                .andExpect(jsonPath("$.data.items[0].status").value("DISABLED"));

        // contact 传 null 显式清空
        update.put("contact", null);
        update.put("status", "ENABLED");
        mockMvc.perform(put("/api/v1/masterdata/customers/" + id)
                        .header("Authorization", token())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(update)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.contact").value(nullValue()))
                .andExpect(jsonPath("$.data.status").value("ENABLED"));
    }

    @Test
    void update_unknown_id_returns_404() throws Exception {
        Map<String, Object> update = Map.of("name", "不存在的客户");
        mockMvc.perform(put("/api/v1/masterdata/customers/999999999")
                        .header("Authorization", token())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(update)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("NOT_FOUND"));
    }

    @Test
    void create_without_name_returns_field_validation_error() throws Exception {
        mockMvc.perform(post("/api/v1/masterdata/customers")
                        .header("Authorization", token())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.data.fieldErrors.name").value("名称不能为空"));
    }

    @Test
    void create_with_invalid_number_format_returns_field_validation_error() throws Exception {
        mockMvc.perform(post("/api/v1/masterdata/customers")
                        .header("Authorization", token())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"customerNo\":\"BAD-1\",\"name\":\"编号格式错误\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.data.fieldErrors.customerNo").value("客户编号格式须为 CUS-0001 形式"));
    }

    @Test
    void pagination_keyword_and_status_filters() throws Exception {
        String marker = uniqueMarker("客户-分页");
        createCustomer(marker + "-A", null, null);
        createCustomer(marker + "-B", null, null);
        JsonNode disabled = createCustomer(marker + "-C", null, null);

        Map<String, Object> disable = new HashMap<>();
        disable.put("name", marker + "-C");
        disable.put("status", "DISABLED");
        mockMvc.perform(put("/api/v1/masterdata/customers/" + disabled.get("id").asLong())
                        .header("Authorization", token())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(disable)))
                .andExpect(status().isOk());

        // 分页：共 3 条，每页 2 条
        mockMvc.perform(get("/api/v1/masterdata/customers")
                        .header("Authorization", token())
                        .param("keyword", marker)
                        .param("page", "1")
                        .param("size", "2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.total").value(3))
                .andExpect(jsonPath("$.data.page").value(1))
                .andExpect(jsonPath("$.data.size").value(2))
                .andExpect(jsonPath("$.data.items.length()").value(2));

        mockMvc.perform(get("/api/v1/masterdata/customers")
                        .header("Authorization", token())
                        .param("keyword", marker)
                        .param("page", "2")
                        .param("size", "2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.total").value(3))
                .andExpect(jsonPath("$.data.items.length()").value(1));

        // 状态筛选
        mockMvc.perform(get("/api/v1/masterdata/customers")
                        .header("Authorization", token())
                        .param("keyword", marker)
                        .param("status", "DISABLED"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.total").value(1))
                .andExpect(jsonPath("$.data.items[0].name").value(marker + "-C"));

        mockMvc.perform(get("/api/v1/masterdata/customers")
                        .header("Authorization", token())
                        .param("keyword", marker)
                        .param("status", "ENABLED"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.total").value(2));
    }

    @Test
    void list_with_invalid_page_returns_validation_error() throws Exception {
        mockMvc.perform(get("/api/v1/masterdata/customers")
                        .header("Authorization", token())
                        .param("page", "0"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.data.fieldErrors.page").value("页码必须大于等于 1"));
    }

    @Test
    void list_with_invalid_status_returns_field_validation_error() throws Exception {
        mockMvc.perform(get("/api/v1/masterdata/customers")
                        .header("Authorization", token())
                        .param("status", "BAD_STATUS"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.data.fieldErrors.status").value("状态只能是 ENABLED 或 DISABLED"));
    }

    @Test
    void delete_is_not_provided_returns_405() throws Exception {
        // 被引用保护：本阶段不提供 DELETE，停用即可（API 文档口径）
        mockMvc.perform(delete("/api/v1/masterdata/customers/1")
                        .header("Authorization", token()))
                .andExpect(status().isMethodNotAllowed())
                .andExpect(jsonPath("$.code").value("METHOD_NOT_ALLOWED"));
    }

    @Test
    void customers_api_requires_authentication() throws Exception {
        mockMvc.perform(get("/api/v1/masterdata/customers"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));

        mockMvc.perform(post("/api/v1/masterdata/customers")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"匿名\"}"))
                .andExpect(status().isUnauthorized());
    }

    private JsonNode createCustomer(String name, String contact, String remark) throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("name", name);
        body.put("contact", contact);
        body.put("remark", remark);
        MvcResult result = mockMvc.perform(post("/api/v1/masterdata/customers")
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
