// 素材失效问题记录：append-only 的 JSONL，绝不把失败伪装成正常。
// 每条失效/降级都记录为待修复问题，可被 listAssetIssues 读回排查。
import fs from 'node:fs';
import path from 'node:path';
import { ASSETS_DIR } from './store.js';

const ISSUES_FILE = path.join(ASSETS_DIR, 'issues.jsonl');

/** 生成唯一 issueId：issue_<时间戳>_<随机>。 */
function makeIssueId() {
  return `issue_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 追加一条素材失效问题，返回 issueId。
 * @param {{cacheKey?: string, keywords?: string[], failedUrl?: string,
 *   reason?: string, fallbackUsed?: boolean, traceId?: string}} param
 * @returns {string} issueId
 */
export function recordAssetIssue({
  cacheKey,
  keywords,
  failedUrl,
  reason,
  fallbackUsed,
  traceId,
} = {}) {
  const issueId = makeIssueId();
  const record = {
    issueId,
    at: Date.now(),
    cacheKey: cacheKey || '',
    keywords: keywords || [],
    failedUrl: failedUrl || '',
    reason: reason || 'unknown',
    fallbackUsed: Boolean(fallbackUsed),
    traceId: traceId || '',
    resolved: false, // 显式标注：待修复问题，不是正常状态
  };
  try {
    fs.mkdirSync(path.dirname(ISSUES_FILE), { recursive: true });
    fs.appendFileSync(ISSUES_FILE, `${JSON.stringify(record)}\n`, 'utf8');
  } catch (err) {
    // 记录失败不应阻断主流程，但必须显式告警（这本身也是待修复问题）。
    console.error('[assets] 写入 issues.jsonl 失败:', err?.message || err);
  }
  console.warn(
    `[assets] 素材问题已记录 issueId=${issueId} reason=${record.reason} url=${record.failedUrl}`
  );
  return issueId;
}

/**
 * 读回失效问题列表，损坏行跳过并 warn。
 * @param {{since?: number}} [opts] since 为时间戳，仅返回该时间之后的问题
 * @returns {Array<object>}
 */
export function listAssetIssues({ since } = {}) {
  if (!fs.existsSync(ISSUES_FILE)) return [];
  let raw;
  try {
    raw = fs.readFileSync(ISSUES_FILE, 'utf8');
  } catch (err) {
    console.warn('[assets] 读取 issues.jsonl 失败:', err?.message || err);
    return [];
  }
  const out = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const rec = JSON.parse(trimmed);
      if (typeof since === 'number' && typeof rec.at === 'number' && rec.at < since) continue;
      out.push(rec);
    } catch (err) {
      console.warn('[assets] 跳过损坏 issue 行:', err?.message || err);
    }
  }
  return out;
}
