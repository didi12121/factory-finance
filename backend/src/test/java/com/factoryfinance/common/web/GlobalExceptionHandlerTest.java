package com.factoryfinance.common.web;

import com.factoryfinance.common.exception.BusinessException;
import com.factoryfinance.common.api.ErrorCode;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 统一异常响应与参数校验测试（独立 MockMvc，不依赖数据库）。
 */
class GlobalExceptionHandlerTest {

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(new ProbeController())
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void validation_error_returns_400_with_field_errors() throws Exception {
        mockMvc.perform(post("/probe").contentType("application/json")
                        .content("{\"name\":\"\",\"count\":0}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.data.fieldErrors.name").exists())
                .andExpect(jsonPath("$.data.fieldErrors.count").exists())
                .andExpect(jsonPath("$.traceId").exists());
    }

    @Test
    void valid_request_passes() throws Exception {
        mockMvc.perform(post("/probe").contentType("application/json")
                        .content("{\"name\":\"测试\",\"count\":1}"))
                .andExpect(status().isOk());
    }

    @Test
    void business_exception_maps_to_its_status() throws Exception {
        mockMvc.perform(post("/probe/not-found").contentType("application/json")
                        .content("{\"name\":\"x\",\"count\":1}"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("NOT_FOUND"))
                .andExpect(jsonPath("$.message").value("客户不存在"));
    }

    @Test
    void unexpected_exception_returns_500_without_leaking_details() throws Exception {
        mockMvc.perform(post("/probe/boom").contentType("application/json")
                        .content("{\"name\":\"x\",\"count\":1}"))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.code").value("INTERNAL_ERROR"));
    }

    @Test
    void malformed_json_returns_400() throws Exception {
        mockMvc.perform(post("/probe").contentType("application/json")
                        .content("{not-json"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("BAD_REQUEST"));
    }

    @RestController
    static class ProbeController {

        @PostMapping("/probe")
        String probe(@Valid @RequestBody ProbeRequest request) {
            return "ok";
        }

        @PostMapping("/probe/not-found")
        String notFound(@Valid @RequestBody ProbeRequest request) {
            throw BusinessException.notFound("客户");
        }

        @PostMapping("/probe/boom")
        String boom(@Valid @RequestBody ProbeRequest request) {
            throw new IllegalStateException("internal detail should not leak");
        }
    }

    record ProbeRequest(@NotBlank(message = "名称不能为空") String name,
                        @Min(value = 1, message = "数量必须大于等于 1") Integer count) {
    }
}
