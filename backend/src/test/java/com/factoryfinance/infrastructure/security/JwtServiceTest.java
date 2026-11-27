package com.factoryfinance.infrastructure.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.JwtParser;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.MissingClaimException;
import io.jsonwebtoken.security.Keys;
import io.jsonwebtoken.security.MacAlgorithm;
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

    /**
     * 同一把 HMAC 测试密钥（≥64 字节 / 512 位，满足 RFC 7518 对 HS512 的密钥长度要求）：
     * HS256/HS384/HS512 三个令牌均用该密钥正确签名，确保算法白名单测试的拒绝
     * 原因只能是算法不符，而非签名或密钥问题。
     */
    private static final String SHARED_SECRET =
            "factory-finance-shared-unit-test-hmac-key-at-least-64-bytes-for-hs512-0123456789";

    private static JwtService service(Duration ttl) {
        JwtProperties properties = new JwtProperties();
        properties.setSecret(SHARED_SECRET);
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
        return Keys.hmacShaKeyFor(SHARED_SECRET.getBytes(StandardCharsets.UTF_8));
    }

    private static Date inOneMinute() {
        return new Date(System.currentTimeMillis() + 60_000);
    }

    /** 手工构造令牌：同一把共享密钥 + 指定算法正确签名，必要声明齐全 */
    private static String tokenSignedWith(MacAlgorithm alg) {
        return Jwts.builder()
                .subject("user-1")
                .issuer("factory-finance")
                .issuedAt(new Date())
                .expiration(inOneMinute())
                .signWith(hmacKey(), alg)
                .compact();
    }

    @Test
    void parse_rejects_non_hs256_algorithm() {
        // 同一把 ≥64 字节共享 HMAC 密钥正确签名的 HS512 令牌，仅因算法白名单被拒绝
        String hs512Token = tokenSignedWith(Jwts.SIG.HS512);

        JwtService service = service(Duration.ofMinutes(5));
        assertThat(service.isValid(hs512Token)).isFalse();
        assertThatThrownBy(() -> service.parseToken(hs512Token)).isInstanceOf(JwtException.class);
    }

    @Test
    void whitelist_accepts_hs256_token_signed_with_shared_key() {
        String hs256Token = tokenSignedWith(Jwts.SIG.HS256);

        JwtService service = service(Duration.ofMinutes(5));
        Claims claims = service.parseToken(hs256Token);

        assertThat(claims.getSubject()).isEqualTo("user-1");
        assertThat(claims.getIssuer()).isEqualTo("factory-finance");
        assertThat(service.isValid(hs256Token)).isTrue();
    }

    @Test
    void whitelist_rejects_hs384_token_signed_with_shared_key() {
        String hs384Token = tokenSignedWith(Jwts.SIG.HS384);

        JwtService service = service(Duration.ofMinutes(5));
        assertThat(service.isValid(hs384Token)).isFalse();
        assertThatThrownBy(() -> service.parseToken(hs384Token)).isInstanceOf(JwtException.class);
    }

    @Test
    void whitelist_rejects_hs512_token_signed_with_shared_key() {
        String hs512Token = tokenSignedWith(Jwts.SIG.HS512);

        JwtService service = service(Duration.ofMinutes(5));
        assertThat(service.isValid(hs512Token)).isFalse();
        assertThatThrownBy(() -> service.parseToken(hs512Token)).isInstanceOf(JwtException.class);
    }

    @Test
    void control_parser_without_whitelist_verifies_hs384_and_hs512_signatures() {
        // 对照解析器：不限制算法（不调用 sig()），仅以同一把共享密钥验证签名与 issuer。
        // HS384/HS512 令牌在此解析成功，证明它们本身签名有效——正式解析器拒绝它们的
        // 原因只能是算法白名单，而非签名或密钥问题。
        JwtParser controlParser = Jwts.parser()
                .verifyWith(hmacKey())
                .requireIssuer("factory-finance")
                .clockSkewSeconds(30)
                .build();

        String hs384Token = tokenSignedWith(Jwts.SIG.HS384);
        String hs512Token = tokenSignedWith(Jwts.SIG.HS512);

        assertThat(controlParser.parseSignedClaims(hs384Token).getPayload().getSubject()).isEqualTo("user-1");
        assertThat(controlParser.parseSignedClaims(hs512Token).getPayload().getSubject()).isEqualTo("user-1");

        // 同一令牌交给正式解析器（HS256 白名单）则被拒绝
        JwtService service = service(Duration.ofMinutes(5));
        assertThatThrownBy(() -> service.parseToken(hs384Token)).isInstanceOf(JwtException.class);
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
