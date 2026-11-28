package com.factoryfinance.infrastructure.idempotency;

import com.factoryfinance.common.exception.BusinessException;
import com.factoryfinance.common.validation.ValidationRules;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * 请求幂等守卫（数据库唯一约束为最终防线，独立于业务单据编号）。
 *
 * <p>工作方式：</p>
 * <ol>
 *   <li>业务服务先 {@link #reserve(String, String, String)} 占位（插入 (operation, idem_key) 唯一行）；</li>
 *   <li>单据与资金流水在后续同事务内创建，成功后 {@link #bind} 回填单据类型与主键；</li>
 *   <li>同键同参重复提交：唯一键冲突 → 读取已提交记录 → 返回原单据，不重复生成单据与流水；</li>
 *   <li>同键异参：request_hash 不一致 → 409 CONFLICT；</li>
 *   <li>不同键的相同业务内容：各自正常提交（业务内容不参与唯一性判断）。</li>
 * </ol>
 *
 * <p>并发语义：第二个相同键的 INSERT 会在唯一索引上等待首个事务；首个提交则第二个
 * 拿到唯一键冲突并返回原单据，首个回滚则第二个正常占位，因此不存在重复记账窗口。</p>
 */
@Component
public class IdempotencyGuard {

    /** 幂等键：8-96 位字母数字（含 - _），避免客户端传入任意内容 */
    private static final Pattern KEY_PATTERN = Pattern.compile("^[A-Za-z0-9_-]{8,96}$");

    /** 占位单据类型（未绑定业务单据） */
    public static final String PENDING = "PENDING";

    private final RequestIdempotencyMapper mapper;

    public IdempotencyGuard(RequestIdempotencyMapper mapper) {
        this.mapper = mapper;
    }

    /**
     * 幂等占位结果。
     *
     * @param existing true 表示该键已存在（应直接返回既有单据，不再创建）
     * @param docType  已绑定单据类型（existing=true 时有效）
     * @param docId    已绑定单据主键（existing=true 时有效）
     */
    public record Reservation(String operation, String idemKey, String requestHash,
                              boolean existing, String docType, long docId, long recordId) {

        public long requireDocId() {
            if (!existing || docId <= 0) {
                throw BusinessException.conflict("幂等键已存在但未绑定业务单据，请稍后重试");
            }
            return docId;
        }
    }

    /** 校验并归一化幂等键（缺失/格式非法 → VALIDATION_ERROR） */
    public String requireKey(String raw) {
        if (raw == null || raw.isBlank()) {
            throw ValidationRules.invalid("idempotencyKey", "幂等键必填（每次独立业务操作生成，重试复用同一键）");
        }
        String key = raw.trim();
        if (!KEY_PATTERN.matcher(key).matches()) {
            throw ValidationRules.invalid("idempotencyKey", "幂等键格式不合法：应为 8-96 位字母、数字、下划线或短横线");
        }
        return key;
    }

    /** 请求指纹（参与幂等的业务参数规范化后拼接；金额请传入 DECIMAL(18,2) 字符串） */
    public String fingerprint(String... parts) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < parts.length; i++) {
            if (i > 0) {
                sb.append('|');
            }
            sb.append(parts[i] == null ? "" : parts[i]);
        }
        return sha256(sb.toString());
    }

    /** 查询既有记录（不占位） */
    public Optional<Reservation> find(String operation, String idemKey) {
        RequestIdempotency row = mapper.selectByKey(operation, idemKey);
        if (row == null) {
            return Optional.empty();
        }
        return Optional.of(new Reservation(operation, idemKey, row.getRequestHash(),
                true, row.getDocType(), row.getDocId() == null ? 0L : row.getDocId(), row.getId()));
    }

    /**
     * 占位幂等键。
     *
     * @return existing=true 表示应返回既有单据；existing=false 表示本次为首次请求，可继续创建业务单据
     */
    public Reservation reserve(String operation, String idemKey, String requestHash) {
        RequestIdempotency row = new RequestIdempotency();
        row.setOperation(operation);
        row.setIdemKey(idemKey);
        row.setRequestHash(requestHash);
        row.setDocType(PENDING);
        row.setDocId(0L);
        try {
            mapper.insert(row);
            return new Reservation(operation, idemKey, requestHash, false, PENDING, 0L, row.getId());
        } catch (DuplicateKeyException duplicate) {
            // 唯一键冲突：用当前读（FOR UPDATE）读取已提交的同键记录，
            // 避免 REPEATABLE READ 快照读不到并发事务刚提交的行。
            RequestIdempotency existing = mapper.selectByKeyForUpdate(operation, idemKey);
            if (existing == null) {
                throw BusinessException.conflict("幂等键并发冲突，请稍后重试");
            }
            if (!requestHash.equals(existing.getRequestHash())) {
                throw BusinessException.conflict("幂等键冲突：同一幂等键携带了不同业务内容，已拒绝该请求");
            }
            if (existing.getDocId() == null || existing.getDocId() <= 0) {
                throw BusinessException.conflict("同一幂等键的请求正在处理中，请稍后重试");
            }
            return new Reservation(operation, idemKey, requestHash, true,
                    existing.getDocType(), existing.getDocId(), existing.getId());
        }
    }

    /** 事务内回填业务单据类型与主键 */
    public void bind(Reservation reservation, String docType, long docId) {
        RequestIdempotency update = new RequestIdempotency();
        update.setId(reservation.recordId());
        update.setDocType(docType);
        update.setDocId(docId);
        mapper.updateById(update);
    }

    private static String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(hash.length * 2);
            for (byte b : hash) {
                hex.append(Character.forDigit((b >> 4) & 0xF, 16));
                hex.append(Character.forDigit(b & 0xF, 16));
            }
            return hex.toString();
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 不可用", ex);
        }
    }
}
