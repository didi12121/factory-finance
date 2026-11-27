package com.factoryfinance.infrastructure.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jws;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.MissingClaimException;
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
     * 解析并验证令牌。
     *
     * <p>算法约束：使用 JJWT 官方算法白名单机制（{@code sig()}）仅允许 HS256，
     * 其他签名算法（如 HS512/RS256/none）在已验证的解析流程中直接拒绝；
     * 不依赖未验证的 JWT Header 判断合法性（签名校验必须先行通过）。</p>
     *
     * <p>必要声明校验：{@code sub}、{@code iss}、{@code iat}、{@code exp} 必须存在，
     * 缺失即拒绝；{@code iss} 同时要求与配置签发者一致；{@code exp} 按 30 秒时钟偏移校验过期。</p>
     *
     * @throws JwtException 令牌无效、被篡改、算法不符、缺少必要声明或已过期
     */
    public Claims parseToken(String token) {
        Jws<Claims> jws = Jwts.parser()
                // 官方算法白名单：仅接受 HS256
                .sig().add(Jwts.SIG.HS256).and()
                .verifyWith(key)
                .requireIssuer(properties.getIssuer())
                .clockSkewSeconds(30)
                .build()
                .parseSignedClaims(token);
        Claims claims = jws.getPayload();
        requireClaim(jws, claims, "sub", claims.getSubject());
        requireClaim(jws, claims, "iss", claims.getIssuer());
        requireClaim(jws, claims, "iat", claims.getIssuedAt());
        requireClaim(jws, claims, "exp", claims.getExpiration());
        return claims;
    }

    /** 必要声明存在性校验（在签名校验通过后执行） */
    private void requireClaim(Jws<Claims> jws, Claims claims, String claimName, Object value) {
        if (value == null) {
            throw new MissingClaimException(jws.getHeader(), claims, claimName,
                    "present", "JWT 缺少必要声明: " + claimName);
        }
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
