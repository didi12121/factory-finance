package com.factoryfinance.common.api;

import com.factoryfinance.common.web.TraceIdFilter;
import org.slf4j.MDC;

/**
 * 统一 API 响应模型。
 *
 * <pre>{@code
 * {
 *   "code": "SUCCESS",
 *   "message": "success",
 *   "data": {},
 *   "traceId": "..."
 * }
 * }</pre>
 */
public record ApiResponse<T>(String code, String message, T data, String traceId) {

    public static <T> ApiResponse<T> success(T data) {
        return new ApiResponse<>(ErrorCode.SUCCESS.getCode(),
                ErrorCode.SUCCESS.getDefaultMessage(), data, currentTraceId());
    }

    public static ApiResponse<Void> success() {
        return success(null);
    }

    public static <T> ApiResponse<T> error(ErrorCode errorCode, String message) {
        return new ApiResponse<>(errorCode.getCode(), message, null, currentTraceId());
    }

    public static <T> ApiResponse<T> error(ErrorCode errorCode) {
        return error(errorCode, errorCode.getDefaultMessage());
    }

    private static String currentTraceId() {
        String traceId = MDC.get(TraceIdFilter.TRACE_ID_KEY);
        return traceId == null ? "" : traceId;
    }
}
