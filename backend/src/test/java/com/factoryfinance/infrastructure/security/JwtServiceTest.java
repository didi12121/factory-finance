package com.factoryfinance.infrastructure.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.MissingClaimException;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.Test;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.Date;
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

    @Test
    void reserved_claims_cannot_be_overridden_by_extra_claims() {
        JwtService service = service(Duration.ofMinutes(5));
        String token = service.generateToken("user-1",
                Map.of("sub", "evil", "iss", "evil-issuer", "role", "accountant"));

        Claims claims = service.parseToken(token);
        assertThat(claims.getSubject()).isEqualTo("user-1");
        assertThat(claims.getIssuer()).isEqualTo("factory-finance");
        assertThat(claims.get("role", String.class)).isEqualTo("accountant");
    }

    @Test
    void short_secret_is_rejected() {
        JwtProperties properties = new JwtProperties();
        properties.setSecret("short-secret");
        properties.setIssuer("factory-finance");

        assertThatThrownBy(() -> new JwtService(properties))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("32");
    }

    @Test
    void token_uses_hs256_algorithm() {
        String token = service(Duration.ofMinutes(5)).generateToken("user-1", Map.of());
        String headerJson = new String(
                Base64.getUrlDecoder().decode(token.split("\\.")[0]), StandardCharsets.UTF_8);

        assertThat(headerJson).contains("\"alg\":\"" + JwtService.ALGORITHM + "\"");
    }

    private static SecretKey hmacKey() {
        return Keys.hmacShaKeyFor("unit-test-secret-key-with-at-least-32-bytes!!".getBytes(StandardCharsets.UTF_8));
    }

    private static Date inOneMinute() {
        return new Date(System.currentTimeMillis() + 60_000);
    }

    @Test
    void parse_rejects_non_hs256_algorithm() {
        // HS512 要求密钥 ≥ 512 位（RFC 7518），使用专用长密钥构造"外来"令牌
        SecretKey hs512Key = Keys.hmacShaKeyFor(
                "unit-test-secret-key-extended-for-hs512-algorithm-signing-tests-0123456789"
                        .getBytes(StandardCharsets.UTF_8));
        String hs512Token = Jwts.builder()
                .subject("user-1")
                .issuer("factory-finance")
                .issuedAt(new Date())
                .expiration(inOneMinute())
                .signWith(hs512Key, Jwts.SIG.HS512)
                .compact();

        JwtService service = service(Duration.ofMinutes(5));
        assertThat(service.isValid(hs512Token)).isFalse();
        assertThatThrownBy(() -> service.parseToken(hs512Token)).isInstanceOf(JwtException.class);
    }

    @Test
    void parse_rejects_token_without_subject() {
        String token = Jwts.builder()
                .issuer("factory-finance")
                .issuedAt(new Date())
                .expiration(inOneMinute())
                .signWith(hmacKey(), Jwts.SIG.HS256)
                .compact();

        assertThatThrownBy(() -> service(Duration.ofMinutes(5)).parseToken(token))
                .isInstanceOf(MissingClaimException.class);
    }

    @Test
    void parse_rejects_token_without_issued_at() {
        String token = Jwts.builder()
                .subject("user-1")
                .issuer("factory-finance")
                .expiration(inOneMinute())
                .signWith(hmacKey(), Jwts.SIG.HS256)
                .compact();

        assertThatThrownBy(() -> service(Duration.ofMinutes(5)).parseToken(token))
                .isInstanceOf(MissingClaimException.class);
    }

    @Test
    void parse_rejects_token_without_expiration() {
        String token = Jwts.builder()
                .subject("user-1")
                .issuer("factory-finance")
                .issuedAt(new Date())
                .signWith(hmacKey(), Jwts.SIG.HS256)
                .compact();

        assertThatThrownBy(() -> service(Duration.ofMinutes(5)).parseToken(token))
                .isInstanceOf(MissingClaimException.class);
    }

    @Test
    void parse_rejects_wrong_issuer() {
        String token = Jwts.builder()
                .subject("user-1")
                .issuer("evil-issuer")
                .issuedAt(new Date())
                .expiration(inOneMinute())
                .signWith(hmacKey(), Jwts.SIG.HS256)
                .compact();

        JwtService service = service(Duration.ofMinutes(5));
        assertThat(service.isValid(token)).isFalse();
        assertThatThrownBy(() -> service.parseToken(token)).isInstanceOf(JwtException.class);
    }
}
