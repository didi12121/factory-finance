package com.factoryfinance.common.api;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;

import static org.assertj.core.api.Assertions.assertThat;

class ApiResponseTest {

    @AfterEach
    void clearMdc() {
        MDC.clear();
    }

    @Test
    void success_response_uses_success_code() {
        ApiResponse<String> response = ApiResponse.success("payload");

        assertThat(response.code()).isEqualTo("SUCCESS");
        assertThat(response.message()).isEqualTo("success");
        assertThat(response.data()).isEqualTo("payload");
    }

    @Test
    void error_response_carries_error_code_and_message() {
        ApiResponse<Void> response = ApiResponse.error(ErrorCode.NOT_FOUND, "客户不存在");

        assertThat(response.code()).isEqualTo("NOT_FOUND");
        assertThat(response.message()).isEqualTo("客户不存在");
        assertThat(response.data()).isNull();
    }

    @Test
    void response_includes_trace_id_from_mdc() {
        MDC.put("traceId", "trace-123");
        ApiResponse<Void> response = ApiResponse.success();
        assertThat(response.traceId()).isEqualTo("trace-123");
    }
}
