package com.factoryfinance;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MvcResult;

import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 需要 Bearer 认证的集成测试基类：提供登录取令牌与测试用户构造辅助。
 * 真实断言走 MockMvc + 真实 MySQL（Testcontainers），禁止伪造 JWT。
 */
public abstract class AuthenticatedIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    protected ObjectMapper objectMapper;

    @Autowired
    protected PasswordEncoder passwordEncoder;

    /** 登录并返回 accessToken（断言登录成功） */
    protected String login(String username, String password) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                Map.of("username", username, "password", password))))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode data = readTree(result).get("data");
        return data.get("accessToken").asText();
    }

    /** Bearer 头 */
    protected String bearer(String token) {
        return "Bearer " + token;
    }

    /** 生成唯一测试标记（用于关键字筛选隔离共享测试库中的数据） */
    protected static String uniqueMarker(String prefix) {
        return prefix + "-" + UUID.randomUUID().toString().substring(0, 8);
    }

    /** 直接落库创建测试用户（用户名唯一） */
    protected void insertUser(String username, String rawPassword, String status) {
        jdbcTemplate.update(
                "INSERT INTO sys_user (username, password_hash, display_name, status) VALUES (?,?,?,?)",
                username, passwordEncoder.encode(rawPassword), "测试用户-" + username, status);
    }

    protected JsonNode readTree(MvcResult result) throws Exception {
        return objectMapper.readTree(result.getResponse().getContentAsString(StandardCharsets.UTF_8));
    }
}
