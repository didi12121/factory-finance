package com.factoryfinance.common.api;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

/**
 * 统一分页查询参数。
 *
 * @param page 页码，从 1 开始
 * @param size 每页条数，1-500
 */
public record PageQuery(
        @Min(value = 1, message = "页码必须大于等于 1")
        Integer page,

        @Min(value = 1, message = "每页条数必须大于等于 1")
        @Max(value = 500, message = "每页条数不能超过 500")
        Integer size) {

    public static final int DEFAULT_PAGE = 1;
    public static final int DEFAULT_SIZE = 20;

    public static PageQuery of(Integer page, Integer size) {
        return new PageQuery(page == null ? DEFAULT_PAGE : page,
                size == null ? DEFAULT_SIZE : size);
    }

    public int offset() {
        return (normalizedPage() - 1) * normalizedSize();
    }

    public int normalizedPage() {
        return page == null ? DEFAULT_PAGE : page;
    }

    public int normalizedSize() {
        return size == null ? DEFAULT_SIZE : size;
    }
}
