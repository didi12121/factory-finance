#!/usr/bin/env node
/**
 * verify-isolation.mjs —— 多环境构建产物隔离扫描器（Phase 0.3 Task B2）。
 *
 * 用法：
 *   node scripts/verify-isolation.mjs --mode <production|staging|uat|demo-custom|test> \
 *        [--dist dist] [--json report.json] [--expect-demo]
 *
 * 扫描口径（吸收 Phase 0.2 QA「扫描教训」）：
 *   - **全部输出文件**：递归遍历产物目录，不限扩展名、不跳过任何文件
 *     （chunk / index.html / CSS / manifest / sourcemap / 字体二进制等一律按字节扫描，
 *      覆盖 Rollup chunk、Vite manifest、module build record 等一切产物形态）；
 *   - **文本 + 二进制字符串双形态**：每个特征按
 *     ① UTF-8 字面字节 ② UTF-16LE 字节 ③ UTF-16BE 字节
 *     ④ \uXXXX 转义（小写十六进制）⑤ \uXXXX 转义（大写十六进制）
 *     五形态检索，文本文件与二进制文件同一口径；
 *   - **骨架对照防「空扫描」误判**：App Shell / 占位页特征必须 ≥1 命中，
 *     否则判定产物为空/目录错误/编码错误而 FAIL（而非误报 0 命中通过）；
 *   - **chunk 文件名对照**：产物文件名不得含演示模块名（DesignSystem/Dashboard/
 *     Transactions/Receivable/Receipt/prototype/fixture）。
 *
 * 断言：
 *   - 默认（隔离断言）：全部演示/虚构特征 0 命中 → PASS，否则 FAIL（exit 1）；
 *   - --expect-demo（test 模式对照，证明允许清单内环境演示完好）：
 *     演示特征总命中 > 0、演示 chunk 文件名存在且骨架 > 0 → PASS。
 *
 * 输出：文件数、字节数、扩展名分布、逐特征命中数（文本 + 二进制双形态）。
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import process from 'node:process'

// ---------------------------------------------------------------------------
// 参数
// ---------------------------------------------------------------------------
const args = process.argv.slice(2)
function argValue(name) {
  const i = args.indexOf(name)
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined
}
const MODE = argValue('--mode') ?? 'unknown'
const DIST = resolve(argValue('--dist') ?? 'dist')
const JSON_OUT = argValue('--json')
const EXPECT_DEMO = args.includes('--expect-demo')

// ---------------------------------------------------------------------------
// 特征清单（Mock Store 业务实现 + 虚构 Fixture + Design System 展示页，25+）
// ---------------------------------------------------------------------------
/** 演示/虚构特征（隔离断言要求 0 命中） */
const FORBIDDEN_FEATURES = [
  // A. Mock Store / Prototype Engine 业务实现（对象方法名/属性名/Store id 字面量）
  { id: 'confirmReceipt', category: 'mock-store' },
  { id: 'createReceivable', category: 'mock-store' },
  { id: 'autoAllocateReceipt', category: 'mock-store' },
  { id: 'previewReceiptAllocation', category: 'mock-store' },
  { id: 'recomputeAccountBalance', category: 'mock-store' },
  { id: 'getDashboardSummary', category: 'mock-store' },
  { id: 'idempotencyKey', category: 'mock-store' },
  { id: 'listReceipts', category: 'mock-store' },
  // B. 虚构 Fixture 数据特征
  { id: '示例客户', category: 'fixture' },
  { id: '示例供应商', category: 'fixture' },
  { id: '示例股东', category: 'fixture' },
  { id: '示例物业', category: 'fixture' },
  { id: '虚构演示数据', category: 'fixture' },
  { id: '虚构测试数据', category: 'fixture' },
  { id: '虚构', category: 'fixture' },
  { id: '跨模块演示场景', category: 'fixture' },
  { id: 'DEMO_TODAY', category: 'fixture' },
  { id: '2026-11-30', category: 'fixture' },
  { id: 'AR-2026-', category: 'fixture' },
  { id: 'SK-2026-', category: 'fixture' },
  { id: 'FT-2026-', category: 'fixture' },
  { id: 'demo-rc-', category: 'fixture' },
  { id: 'BANK-REF-', category: 'fixture' },
  { id: 'cust-a', category: 'fixture' },
  { id: 'acct-bank', category: 'fixture' },
  { id: '收款单', category: 'fixture' },
  { id: '登记回款', category: 'fixture' },
  // C. Design System 展示页特征
  { id: 'Color Tokens', category: 'design-system' },
  { id: 'XS-2026-', category: 'design-system' },
  { id: '组件展示页', category: 'design-system' },
]

/**
 * 骨架对照特征（App Shell / 占位页，必须 ≥1 命中，防「空扫描」误判）。
 * 全部来自非演示路径：navigation.ts 分组/条目、PlaceholderView、index.html。
 */
const SKELETON_FEATURES = ['工厂财务', '工作台', '经营概览', '资金管理', '业务管理', '应收账款', '该功能尚未实现']

/** 演示 chunk 文件名禁用模式 */
const FORBIDDEN_NAME_RE = /designsystem|dashboard|transactions|receivable|receipt|prototype|fixture|mockstore/i

// ---------------------------------------------------------------------------
// 多形态编码
// ---------------------------------------------------------------------------
/** 一个特征的全部检索形态：文本字面（UTF-8/UTF-16LE/UTF-16BE）+ \uXXXX 转义双形态（兼容二进制内嵌） */
function encodeForms(s) {
  const utf8 = Buffer.from(s, 'utf8')
  const utf16le = Buffer.from(s, 'utf16le')
  const utf16be = Buffer.from(utf16le) // 复制后逐 2 字节交换
  for (let i = 0; i + 1 < utf16be.length; i += 2) {
    const t = utf16be[i]
    utf16be[i] = utf16be[i + 1]
    utf16be[i + 1] = t
  }
  const codePoints = [...s].map((c) => c.codePointAt(0))
  const escLower = codePoints.map((cp) => `\\u${cp.toString(16).padStart(4, '0')}`).join('')
  const escUpper = codePoints.map((cp) => `\\u${cp.toString(16).toUpperCase().padStart(4, '0')}`).join('')
  return {
    utf8,
    utf16le,
    utf16be,
    'escaped-lower': Buffer.from(escLower, 'ascii'),
    'escaped-upper': Buffer.from(escUpper, 'ascii'),
  }
}

function countOccurrences(buf, needle) {
  if (needle.length === 0 || needle.length > buf.length) return 0
  let count = 0
  let idx = buf.indexOf(needle)
  while (idx !== -1) {
    count += 1
    idx = buf.indexOf(needle, idx + needle.length)
  }
  return count
}

// ---------------------------------------------------------------------------
// 产物遍历（全部文件，不限扩展名）
// ---------------------------------------------------------------------------
function walk(dir) {
  const files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...walk(full))
    else if (entry.isFile()) files.push(full)
  }
  return files
}

const stat = statSync(DIST, { throwIfNoEntry: false })
if (!stat || !stat.isDirectory()) {
  console.error(`[verify-isolation] FAIL：产物目录不存在或不是目录：${DIST}`)
  process.exit(1)
}

const files = walk(DIST).sort()
if (files.length === 0) {
  console.error(`[verify-isolation] FAIL：产物目录为空（空扫描）：${DIST}`)
  process.exit(1)
}

let totalBytes = 0
const extCount = new Map()
const forbidden = FORBIDDEN_FEATURES.map((f) => ({ ...f, forms: encodeForms(f.id), hits: 0, hitFiles: new Set() }))
const skeleton = SKELETON_FEATURES.map((s) => ({ id: s, forms: encodeForms(s), hits: 0 }))
const forbiddenNames = []

for (const file of files) {
  const rel = relative(DIST, file).replaceAll('\\', '/')
  const buf = readFileSync(file)
  totalBytes += buf.length
  const ext = rel.includes('.') ? rel.slice(rel.lastIndexOf('.')) : '<no-ext>'
  extCount.set(ext, (extCount.get(ext) ?? 0) + 1)

  if (FORBIDDEN_NAME_RE.test(rel)) forbiddenNames.push(rel)

  for (const f of forbidden) {
    for (const form of Object.values(f.forms)) {
      const n = countOccurrences(buf, form)
      if (n > 0) {
        f.hits += n
        f.hitFiles.add(rel)
      }
    }
  }
  for (const s of skeleton) {
    for (const form of Object.values(s.forms)) s.hits += countOccurrences(buf, form)
  }
}

// ---------------------------------------------------------------------------
// 断言与输出
// ---------------------------------------------------------------------------
const forbiddenTotal = forbidden.reduce((acc, f) => acc + f.hits, 0)
const skeletonMissing = skeleton.filter((s) => s.hits === 0)
const skeletonOk = skeletonMissing.length === 0

console.log(`[verify-isolation] mode=${MODE} dist=${DIST}`)
console.log(`files_scanned=${files.length} bytes_scanned=${totalBytes}`)
console.log(`extensions=${[...extCount.entries()].map(([e, n]) => `${e}×${n}`).join(' ')}`)

for (const f of forbidden) {
  console.log(`  [${f.category}] ${f.id} = ${f.hits}${f.hits > 0 ? `  ← 命中文件: ${[...f.hitFiles].join(', ')}` : ''}`)
}
console.log(`forbidden_features=${forbidden.length} forbidden_total_hits=${forbiddenTotal}`)

console.log(`skeleton_control: ${skeleton.map((s) => `${s.id}=${s.hits}`).join(' ')}`)
console.log(`skeleton_control_result=${skeletonOk ? 'PASS（非空扫描）' : `FAIL（空扫描疑虑，缺失: ${skeletonMissing.map((s) => s.id).join(', ')}）`}`)

let pass
if (EXPECT_DEMO) {
  // 对照断言（允许清单内 mode，如 test）：演示 chunk 文件名与演示内容均应存在
  console.log(`chunk_name_control: ${forbiddenNames.length > 0 ? `演示 chunk 存在（预期）: ${forbiddenNames.join(', ')}` : '0 演示 chunk 文件名命中'}`)
  const demoOk = forbiddenTotal > 0 && forbiddenNames.length > 0
  pass = demoOk && skeletonOk
  console.log(`expect_demo_check=${demoOk ? 'PASS（允许清单内 mode 演示内容完好存在）' : 'FAIL（演示内容缺失，build:test/E2E 将被破坏）'}`)
} else {
  console.log(`chunk_name_control: ${forbiddenNames.length === 0 ? '0 演示 chunk 文件名命中' : `命中: ${forbiddenNames.join(', ')}`}`)
  pass = forbiddenTotal === 0 && skeletonOk && forbiddenNames.length === 0
}
console.log(`RESULT: ${pass ? 'PASS' : 'FAIL'}`)

if (JSON_OUT) {
  writeFileSync(
    JSON_OUT,
    JSON.stringify(
      {
        mode: MODE,
        dist: DIST,
        expectDemo: EXPECT_DEMO,
        filesScanned: files.length,
        bytesScanned: totalBytes,
        extensions: Object.fromEntries(extCount),
        forbiddenFeatures: forbidden.map((f) => ({ id: f.id, category: f.category, hits: f.hits, files: [...f.hitFiles] })),
        forbiddenTotalHits: forbiddenTotal,
        skeleton: skeleton.map((s) => ({ id: s.id, hits: s.hits })),
        skeletonOk,
        forbiddenChunkNames: forbiddenNames,
        pass,
      },
      null,
      2,
    ),
  )
  console.log(`report_json=${JSON_OUT}`)
}

process.exit(pass ? 0 : 1)
