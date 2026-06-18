// 素材模块门面：编排本地库 → 缓存 → 在线源 → 降级兜底。
// 核心原则：失败绝不伪装成功；降级显式 degraded:true + issueId，并记录待修复问题。
import { performance } from 'node:perf_hooks';
import { isAllowedAssetUrl } from '../presetRegistry.js';
import { recordAssetIssueSignal } from '../memory.js';
import {
  buildText2ImageUrl,
  buildUnsplashKeywordUrl,
  buildIconUrl,
  probeAssetUrl,
} from './sources.js';
import { makeCacheKey, findInLibrary, getCached, putCached } from './store.js';
import { recordAssetIssue } from './issues.js';

const MAX_CONCURRENCY = 4;

// 兜底占位：内联 data-URI SVG，明确标注为占位（不是真实素材）。
const PLACEHOLDER_SVG =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90">' +
      '<rect width="160" height="90" fill="#222"/>' +
      '<text x="80" y="50" fill="#888" font-size="12" text-anchor="middle">asset unavailable</text>' +
      '</svg>'
  );

/** 薄封装白名单校验。 */
export function validateAssetUrl(url) {
  const ok = isAllowedAssetUrl(url);
  return { ok, reason: ok ? 'allowed' : 'not_in_whitelist' };
}

/** 根据 type/style 选择在线源候选 URL；不支持联网的类型返回 null。 */
function pickOnlineUrl({ type, keywords, opts }) {
  const kw = Array.isArray(keywords) ? keywords : [keywords];
  const promptEn = kw.filter(Boolean).join(', ');
  if (type === 'icon') {
    return { url: buildIconUrl(kw[0] || 'image'), source: 'iconify' };
  }
  if (type === 'image') {
    const style = String(opts.style || '').toLowerCase();
    if (style === 'realistic') {
      return {
        url: buildUnsplashKeywordUrl(kw, { size: opts.sizeHint || '1600x900' }),
        source: 'unsplash',
      };
    }
    return {
      url: buildText2ImageUrl(promptEn, { imageSize: opts.imageSize }),
      source: 'text_to_image',
    };
  }
  // video / model 等类型无在线检索源。
  return null;
}

/**
 * 解析单个素材请求。
 * @param {{type: string, keywords?: string[], opts?: object}} param
 * opts: { sizeHint, style, traceId, allowOnline=true, fetchImpl, imageSize }
 * @returns {Promise<object>}
 */
export async function resolveAsset({ type, keywords = [], opts = {} } = {}) {
  const t0 = performance.now();
  const allowOnline = opts.allowOnline !== false;
  const cacheKey = makeCacheKey({ type, keywords, sizeHint: opts.sizeHint });
  const timing = () => Math.round((performance.now() - t0) * 1000) / 1000;

  // ① 本地库命中优先。
  const local = findInLibrary({ type, keywords });
  if (local) {
    return {
      url: local.path || local.url || '',
      type,
      source: 'local',
      degraded: false,
      issueId: null,
      fromCache: false,
      timingMs: timing(),
    };
  }

  // ② 缓存命中且状态 ok → 复用并 hits++。
  const cached = getCached(cacheKey);
  if (cached && cached.status === 'ok' && cached.resolvedUrl) {
    putCached({ ...cached, hits: (cached.hits || 0) + 1 });
    return {
      url: cached.resolvedUrl,
      type,
      source: cached.source || 'cache',
      degraded: false,
      issueId: null,
      fromCache: true,
      timingMs: timing(),
    };
  }

  // ③ 在线源探测。
  if (allowOnline) {
    const pick = pickOnlineUrl({ type, keywords, opts });
    if (!pick) {
      // video/model 类型且无本地/在线源：明确不支持，记录问题，不伪装成功。
      const issueId = recordAssetIssue({
        cacheKey,
        keywords,
        failedUrl: '',
        reason: 'unsupported_type_no_online',
        fallbackUsed: true,
        traceId: opts.traceId,
      });
      return {
        url: PLACEHOLDER_SVG,
        type,
        source: 'placeholder',
        degraded: true,
        reason: `不支持联网检索此类型: ${type}`,
        issueId,
        fromCache: false,
        timingMs: timing(),
      };
    }

    const probe = await probeAssetUrl(pick.url, { fetchImpl: opts.fetchImpl });
    if (probe.ok) {
      const resolvedUrl = probe.finalUrl || pick.url;
      putCached({
        cacheKey,
        resolvedUrl,
        source: pick.source,
        type,
        keywords,
        hits: 1,
        lastVerifiedAt: Date.now(),
        status: 'ok',
      });
      return {
        url: resolvedUrl,
        type,
        source: pick.source,
        degraded: false,
        issueId: null,
        fromCache: false,
        timingMs: timing(),
      };
    }

    // ④ 在线源失败 → 记录问题 + 降级兜底。
    const issueId = recordAssetIssue({
      cacheKey,
      keywords,
      failedUrl: pick.url,
      reason: probe.reason || 'probe_failed',
      fallbackUsed: true,
      traceId: opts.traceId,
    });
    await recordAssetIssueSignal({ url: pick.url, type, traceId: opts.traceId });
    return {
      url: PLACEHOLDER_SVG,
      type,
      source: 'placeholder',
      degraded: true,
      reason: `在线素材探测失败: ${probe.reason}`,
      issueId,
      fromCache: false,
      timingMs: timing(),
    };
  }

  // 未允许联网且无本地/缓存命中 → 降级。
  const issueId = recordAssetIssue({
    cacheKey,
    keywords,
    failedUrl: '',
    reason: 'no_local_no_cache_online_disabled',
    fallbackUsed: true,
    traceId: opts.traceId,
  });
  return {
    url: PLACEHOLDER_SVG,
    type,
    source: 'placeholder',
    degraded: true,
    reason: '未命中本地/缓存且未允许联网',
    issueId,
    fromCache: false,
    timingMs: timing(),
  };
}

/**
 * 批量解析，受限并发复用 resolveAsset。
 * @param {Array<object>} reqList
 * @returns {Promise<Array<object>>}
 */
export async function resolveAssets(reqList = []) {
  const list = Array.isArray(reqList) ? reqList : [];
  const results = new Array(list.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < list.length) {
      const idx = cursor++;
      results[idx] = await resolveAsset(list[idx]);
    }
  };
  const workers = Array.from(
    { length: Math.min(MAX_CONCURRENCY, list.length || 1) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}
