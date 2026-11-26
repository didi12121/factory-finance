package com.factoryfinance.common.api;

import org.springframework.http.HttpStatus;

/**
 * 统一业务错误码。
 *
 * <p>错误码与 HTTP 状态码保持一致语义；不允许所有请求统一返回 HTTP 200。</p>
 */
public enum ErrorCode {

    SUCCESS("SUCCESS", HttpStatus.OK, "success"),

    BAD_REQUEST("BAD_REQUEST", HttpStatus.BAD_REQUEST, "请求参数不合法"),
    VALIDATION_ERROR("VALIDATION_ERROR", HttpStatus.BAD_REQUEST, "参数校验失败"),
    UNAUTHORIZED("UNAUTHORIZED", HttpStatus.UNAUTHORIZED, "未认证或凭证无效"),
    FORBIDDEN("FORBIDDEN", HttpStatus.FORBIDDEN, "无权访问"),
    NOT_FOUND("NOT_FOUND", HttpStatus.NOT_FOUND, "资源不存在"),
    METHOD_NOT_ALLOWED("METHOD_NOT_ALLOWED", HttpStatus.METHOD_NOT_ALLOWED, "请求方法不允许"),
    CONFLICT("CONFLICT", HttpStatus.CONFLICT, "资源状态冲突"),

    INTERNAL_ERROR("INTERNAL_ERROR", HttpStatus.INTERNAL_SERVER_ERROR, "服务器内部错误");

    private final String code;
    private final HttpStatus status;
    private final String defaultMessage;

    ErrorCode(String code, HttpStatus status, String defaultMessage) {
        this.code = code;
        this.status = status;
        this.defaultMessage = defaultMessage;
    }

    public String getCode() {
        return code;
    }

    public HttpStatus getStatus() {
        return status;
    }

    public String getDefaultMessage() {
        return defaultMessage;
    }
}
