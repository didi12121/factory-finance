package com.factoryfinance.infrastructure.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.JwtException;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class JwtServiceTest {

    private static JwtService service(Duration ttl) {
        JwtProperties properties = new JwtProperties();
        properties.setSecret("unit-test-secret-key-with-at-least-32-bytes!!");
        properties.setIssuer("factory-finance");
        properties.setTtl(ttl);
        return new JwtService(properties);
    }

    @Test
    void round_trip_token_carries_subject_and_claims() {
        JwtService service = service(Duration.ofMinutes(5));

        String token = service.generateToken("user-1", Map.of("role", "accountant"));
        Claims claims = service.parseToken(token);

        assertThat(claims.getSubject()).isEqualTo("user-1");
        assertThat(claims.getIssuer()).isEqualTo("factory-finance");
        assertThat(claims.get("role", String.class)).isEqualTo("accountant");
        assertThat(service.isValid(token)).isTrue();
    }

    @Test
    void tampered_token_is_rejected() {
        JwtService service = service(Duration.ofMinutes(5));
        String token = service.generateToken("user-1", Map.of());
        String tampered = token.substring(0, token.length() - 2) + "ab";

        assertThat(service.isValid(tampered)).isFalse();
        assertThatThrownBy(() -> service.parseToken(tampered)).isInstanceOf(JwtException.class);
    }

    @Test
    void expired_token_is_rejected() {
        // 超过 30 秒时钟偏移容忍
        JwtService service = service(Duration.ofSeconds(-120));
        String token = service.generateToken("user-1", Map.of());

        assertThat(service.isValid(token)).isFalse();
        assertThatThrownBy(() -> service.parseToken(token)).isInstanceOf(ExpiredJwtException.class);
    }
}
