package com.factoryfinance.common.api;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class PageModelTest {

    @Test
    void page_query_defaults_and_offsets() {
        PageQuery query = PageQuery.of(null, null);
        assertThat(query.normalizedPage()).isEqualTo(1);
        assertThat(query.normalizedSize()).isEqualTo(20);
        assertThat(query.offset()).isZero();

        assertThat(PageQuery.of(3, 10).offset()).isEqualTo(20);
    }

    @Test
    void page_result_computes_total_pages() {
        PageResult<String> result = PageResult.of(List.of("a", "b"), 25, 2, 10);
        assertThat(result.totalPages()).isEqualTo(3);
        assertThat(result.items()).containsExactly("a", "b");
    }
}
