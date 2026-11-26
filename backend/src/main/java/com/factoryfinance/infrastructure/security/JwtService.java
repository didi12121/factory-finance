package com.factoryfinance.infrastructure.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

/**
 * JWT 基础服务：签发与验证令牌。
 *
 * <p>算法与密钥策略：</p>
 * <ul>
 *   <li>固定算法 <b>HS256</b>（HMAC-SHA256），不接受其他算法；</li>
 *   <li>签名密钥至少 <b>32 字节</b>，通过环境变量 {@code JWT_SECRET} 注入，
 *       禁止将真实密钥提交到代码仓库；</li>
 *   <li>保留声明（{@code sub/iss/iat/exp/nbf/jti}）由本服务控制，
 *       附加 claims 中的同名键会被过滤，<b>不得覆盖保留声明</b>。</li>
 * </ul>
 *
 * <p>JWT 的签发与生命周期管理（登录、刷新、吊销）属于 Phase 1 范围。</p>
 */
@Component
public class JwtService {

    /** 固定算法 HS256 */
    public static final String ALGORITHM = "HS256";

    /** 签名密钥最小字节数 */
    public static final int MIN_KEY_BYTES = 32;

    private static final Set<String> RESERVED_CLAIMS = Set.of("sub", "iss", "iat", "exp", "nbf", "jti");

    private final JwtProperties properties;
    private final SecretKey key;

    public JwtService(JwtProperties properties) {
        this.properties = properties;
        byte[] secretBytes = String.valueOf(properties.getSecret()).getBytes(StandardCharsets.UTF_8);
        if (properties.getSecret() == null || secretBytes.length < MIN_KEY_BYTES) {
            throw new IllegalStateException("JWT 密钥（JWT_SECRET）至少需要 " + MIN_KEY_BYTES + " 字节");
        }
        this.key = Keys.hmacShaKeyFor(secretBytes);
    }

    /**
     * 签发令牌（HS256）。
     *
     * @param subject 主体标识（通常为用户 ID）
     * @param claims  附加声明；与保留声明同名的键会被过滤，不得覆盖 sub/iss/iat/exp 等
     */
    public String generateToken(String subject, Map<String, Object> claims) {
        Map<String, Object> safeClaims = new LinkedHashMap<>();
        if (claims != null) {
            claims.forEach((claimKey, value) -> {
                if (!RESERVED_CLAIMS.contains(claimKey)) {
                    safeClaims.put(claimKey, value);
                }
            });
        }
        Instant now = Instant.now();
        return Jwts.builder()
                .claims(safeClaims)
                // 保留声明在附加声明之后设置，确保不会被 claims 覆盖
                .subject(subject)
                .issuer(properties.getIssuer())
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(properties.getTtl())))
                .signWith(key, Jwts.SIG.HS256)
                .compact();
    }

    /**
     * 解析并验证令牌（HS256），返回声明。
     *
     * @throws JwtException 令牌无效、被篡改、算法不符或已过期
     */
    public Claims parseToken(String token) {
        return Jwts.parser()
                .verifyWith(key)
                .requireIssuer(properties.getIssuer())
                .clockSkewSeconds(30)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    public boolean isValid(String token) {
        try {
            parseToken(token);
            return true;
        } catch (JwtException | IllegalArgumentException ex) {
            return false;
        }
    }
}
