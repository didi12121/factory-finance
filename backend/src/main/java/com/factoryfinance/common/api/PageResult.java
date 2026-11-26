package com.factoryfinance.common.api;

import java.util.List;

/**
 * 统一分页响应模型。
 *
 * @param items  当前页数据
 * @param total  总条数
 * @param page   当前页码（从 1 开始）
 * @param size   每页条数
 */
public record PageResult<T>(List<T> items, long total, int page, int size) {

    public static <T> PageResult<T> of(List<T> items, long total, int page, int size) {
        return new PageResult<>(List.copyOf(items), total, page, size);
    }

    public long totalPages() {
        return size <= 0 ? 0 : (total + size - 1) / size;
    }
}
