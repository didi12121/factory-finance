package com.factoryfinance.common.web;

import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.assertj.core.api.Assertions.assertThat;

class TraceIdFilterTest {

    private final TraceIdFilter filter = new TraceIdFilter();

    @Test
    void generates_trace_id_and_exposes_header() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/v1/health");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, new MockFilterChain());

        String traceId = response.getHeader(TraceIdFilter.TRACE_HEADER);
        assertThat(traceId).isNotBlank();
        assertThat(MDC.get(TraceIdFilter.TRACE_ID_KEY)).isNull();
    }

    @Test
    void reuses_incoming_trace_id_header() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/v1/health");
        request.addHeader(TraceIdFilter.TRACE_HEADER, "upstream-trace");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, new MockFilterChain());

        assertThat(response.getHeader(TraceIdFilter.TRACE_HEADER)).isEqualTo("upstream-trace");
    }

    @Test
    void invalid_incoming_trace_id_is_replaced() throws Exception {
        String[] invalidIds = {"abc", "has space and 123", "bad\nheader", "x".repeat(65), "中文字符123456"};

        for (String invalidId : invalidIds) {
            MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/v1/health");
            request.addHeader(TraceIdFilter.TRACE_HEADER, invalidId);
            MockHttpServletResponse response = new MockHttpServletResponse();

            filter.doFilter(request, response, new MockFilterChain());

            String traceId = response.getHeader(TraceIdFilter.TRACE_HEADER);
            assertThat(traceId)
                    .as("非法 Trace ID 应被替换: %s", invalidId)
                    .isNotEqualTo(invalidId)
                    .matches(TraceIdFilter.TRACE_ID_PATTERN);
        }
    }

    @Test
    void clears_mdc_after_request() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/v1/health");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, new MockFilterChain());

        assertThat(MDC.get(TraceIdFilter.TRACE_ID_KEY)).isNull();
    }
}
