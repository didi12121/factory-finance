package com.factoryfinance.common.exception;

import com.factoryfinance.common.api.ErrorCode;

/**
 * 业务异常。
 *
 * <p>业务规则冲突、资源不存在等可预期异常统一使用本异常表达，
 * 由 {@code GlobalExceptionHandler} 转换为统一错误响应。</p>
 */
public class BusinessException extends RuntimeException {

    private final ErrorCode errorCode;
    private final transient Object detail;

    public BusinessException(ErrorCode errorCode) {
        this(errorCode, errorCode.getDefaultMessage(), null);
    }

    public BusinessException(ErrorCode errorCode, String message) {
        this(errorCode, message, null);
    }

    public BusinessException(ErrorCode errorCode, String message, Object detail) {
        super(message);
        this.errorCode = errorCode;
        this.detail = detail;
    }

    public static BusinessException notFound(String resource) {
        return new BusinessException(ErrorCode.NOT_FOUND, resource + "不存在");
    }

    public static BusinessException conflict(String message) {
        return new BusinessException(ErrorCode.CONFLICT, message);
    }

    public ErrorCode getErrorCode() {
        return errorCode;
    }

    public Object getDetail() {
        return detail;
    }
}
