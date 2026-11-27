package com.factoryfinance.modules.identity;

import com.factoryfinance.AuthenticatedIntegrationTest;
import com.factoryfinance.infrastructure.security.JwtService;
import com.factoryfinance.modules.identity.infrastructure.AdminBootstrapProperties;
import com.fasterxml.jackson.databind.JsonNode;
import io.jsonwebtoken.Claims;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;

import java.nio.charset.StandardCharsets;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 认证集成测试：登录/登出/修改密码（API_CONTRACT §10，真实 MySQL）。
 */
class AuthIT extends AuthenticatedIntegrationTest {

    @Autowired
    private AdminBootstrapProperties adminBootstrapProperties;

    @Autowired
    private JwtService jwtService;

    @Test
    void login_with_valid_admin_returns_token_and_user_info() throws Exception {
        MvcResultCompat result = loginRaw("admin", adminBootstrapProperties.getInitialPassword());

        assertThat(result.status).isEqualTo(200);
        assertThat(result.body.get("code").asText()).isEqualTo("SUCCESS");
        assertThat(result.body.get("traceId").asText()).isNotBlank();
        assertThat(result.body.get("data").get("tokenType").asText()).isEqualTo("Bearer");
        assertThat(result.body.get("data").get("accessToken").asText()).isNotBlank();
        assertThat(result.body.get("data").get("expiresAt").asLong())
                .isGreaterThan(System.currentTimeMillis() / 1000);
        assertThat(result.body.get("data").get("user").get("username").asText()).isEqualTo("admin");
        assertThat(result.body.get("data").get("user").get("displayName").asText()).isEqualTo("管理员");
    }

    @Test
    void login_token_claims_contain_username_and_display_name() throws Exception {
        String token = login("admin", adminBootstrapProperties.getInitialPassword());

        Claims claims = jwtService.parseToken(token);
        assertThat(claims.getSubject()).isEqualTo("admin");
        assertThat(String.valueOf(claims.get("name"))).isEqualTo("管理员");
        assertThat(jwtService.isValid(token)).isTrue();
    }

    @Test
    void login_with_wrong_password_returns_401_without_user_enumeration() throws Exception {
        MvcResultCompat wrongPassword = loginRaw("admin", "definitely-wrong-password");
        MvcResultCompat unknownUser = loginRaw("no-such-user-" + System.nanoTime(), "definitely-wrong-password");

        assertThat(wrongPassword.status).isEqualTo(401);
        assertThat(unknownUser.status).isEqualTo(401);
        assertThat(wrongPassword.body.get("code").asText()).isEqualTo("UNAUTHORIZED");
        assertThat(unknownUser.body.get("code").asText()).isEqualTo("UNAUTHORIZED");
        // 禁止用户枚举差异提示：两种失败必须同一提示
        assertThat(wrongPassword.body.get("message").asText())
                .isEqualTo(unknownUser.body.get("message").asText())
                .isEqualTo("用户名或密码错误");
    }

    @Test
    void login_with_disabled_user_returns_same_401_message() throws Exception {
        String username = "disabled-" + System.nanoTime();
        insertUser(username, "Password123!", "DISABLED");

        MvcResultCompat disabled = loginRaw(username, "Password123!");
        MvcResultCompat unknown = loginRaw("missing-" + System.nanoTime(), "Password123!");

        assertThat(disabled.status).isEqualTo(401);
        assertThat(disabled.body.get("message").asText()).isEqualTo(unknown.body.get("message").asText());
    }

    @Test
    void login_with_blank_username_returns_field_validation_error() throws Exception {
        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"\",\"password\":\"whatever\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.data.fieldErrors.username").value("用户名不能为空"));
    }

    @Test
    void protected_endpoints_require_token() throws Exception {
        mockMvc.perform(get("/api/v1/masterdata/customers"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
        mockMvc.perform(get("/api/v1/masterdata/shareholders"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
        mockMvc.perform(put("/api/v1/auth/password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"oldPassword\":\"x12345678\",\"newPassword\":\"y12345678\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
    }

    @Test
    void logout_requires_token_and_returns_success() throws Exception {
        mockMvc.perform(post("/api/v1/auth/logout"))
                .andExpect(status().isUnauthorized());

        String token = login("admin", adminBootstrapProperties.getInitialPassword());
        mockMvc.perform(post("/api/v1/auth/logout").header("Authorization", bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"));
    }

    @Test
    void change_password_with_wrong_old_password_returns_401() throws Exception {
        String username = uniqueMarker("cp-wrong");
        insertUser(username, "Password123!", "ENABLED");
        String token = login(username, "Password123!");

        mockMvc.perform(put("/api/v1/auth/password")
                        .header("Authorization", bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                Map.of("oldPassword", "WrongOld123", "newPassword", "NewPass12345"))))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"))
                .andExpect(jsonPath("$.message").value("旧密码不正确"));
    }

    @Test
    void change_password_requires_new_password_min_length_8() throws Exception {
        String username = uniqueMarker("cp-short");
        insertUser(username, "Password123!", "ENABLED");
        String token = login(username, "Password123!");

        mockMvc.perform(put("/api/v1/auth/password")
                        .header("Authorization", bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                Map.of("oldPassword", "Password123!", "newPassword", "short7"))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.data.fieldErrors.newPassword").value("新密码长度必须在 8 到 128 之间"));
    }

    @Test
    void change_password_succeeds_and_old_password_stops_working() throws Exception {
        String username = uniqueMarker("cp-ok");
        insertUser(username, "Password123!", "ENABLED");
        String token = login(username, "Password123!");

        mockMvc.perform(put("/api/v1/auth/password")
                        .header("Authorization", bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                Map.of("oldPassword", "Password123!", "newPassword", "BrandNew12345"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"));

        // BCrypt 已更新
        String hash = jdbcTemplate.queryForObject(
                "SELECT password_hash FROM sys_user WHERE username = ?", String.class, username);
        assertThat(passwordEncoder.matches("BrandNew12345", hash)).isTrue();

        // 旧密码失效、新密码可登录
        MvcResultCompat oldLogin = loginRaw(username, "Password123!");
        assertThat(oldLogin.status).isEqualTo(401);
        String newToken = login(username, "BrandNew12345");
        assertThat(newToken).isNotBlank();
    }

    /** 原始登录（不假设成功） */
    private MvcResultCompat loginRaw(String username, String password) throws Exception {
        var result = mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("username", username, "password", password))))
                .andReturn();
        int status = result.getResponse().getStatus();
        var body = objectMapper.readTree(result.getResponse().getContentAsString(StandardCharsets.UTF_8));
        return new MvcResultCompat(status, body);
    }

    private record MvcResultCompat(int status, JsonNode body) {
    }
}
