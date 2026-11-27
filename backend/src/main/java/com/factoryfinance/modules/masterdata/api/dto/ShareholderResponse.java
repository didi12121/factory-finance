package com.factoryfinance.modules.masterdata.api.dto;

/**
 * 股东响应（审计时间为 yyyy-MM-dd HH:mm:ss 字符串）。
 *
 * @param id            内部主键
 * @param shareholderNo 业务编号（唯一且不可变）
 * @param name          名称
 * @param contact       联系方式
 * @param remark        备注
 * @param status        状态（ENABLED/DISABLED）
 * @param createdAt     创建时间
 * @param updatedAt     更新时间
 */
public record ShareholderResponse(Long id, String shareholderNo, String name, String contact,
                                  String remark, String status, String createdAt, String updatedAt) {
}
