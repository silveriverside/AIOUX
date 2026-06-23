// 记忆门面：内存单例 + 懒加载 + 串行写队列（仿 graph.js 单例与 snapshots commitQueue）。
// 唯一对外编排入口，负责组装 signal、更新画像/页面/资产，并原子落盘。
import { isAllowedAssetUrl } from './presetRegistry.js';
import { loadMemoryFile, writeMemoryFile, createEmptyMemory } from './memoryStore.js';
import { updateProfile, derivePreference, extractKeywords } from './memoryProfile.js';

const MAX_EVENTS = 200; // events 环形缓冲上限

let memory = null; // 内存单例
let loaded = false;
let writeQueue = Promise.resolve(); // 串行写队列

function deepCopy(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// 简单稳定 hash（djb2），用于把 url 规范化为 assetKey。
function hashUrl(url) {
  let h = 5381;
  for (let i = 0; i < url.length; i += 1) h = ((h << 5) + h + url.charCodeAt(i)) >>> 0;
  return `a_${h.toString(36)}`;
}

function ensureAssetRecord(url, { type = null } = {}) {
  const key = hashUrl(url);
  const now = Date.now();
  const rec = memory.assets[key] || {
    assetKey: key,
    url,
    type,
    usedByNodes: [],
    useCount: 0,
    issueCount: 0,
    lastIssueAt: null,
    revertCostCount: 0,
    createdAt: now,
  };
  rec.type = type || rec.type || null;
  if (typeof rec.issueCount !== 'number') rec.issueCount = 0;
  if (typeof rec.revertCostCount !== 'number') rec.revertCostCount = 0;
  if (!Array.isArray(rec.usedByNodes)) rec.usedByNodes = [];
  memory.assets[key] = rec;
  return rec;
}

export function initMemory() {
  if (loaded) return;
  memory = loadMemoryFile();
  loaded = true;
}

function ensureLoaded() {
  if (!loaded) initMemory();
}

export function resetMemory() {
  memory = createEmptyMemory();
  loaded = true;
  return enqueuePersist();
}

export function getMemorySnapshot() {
  ensureLoaded();
  return deepCopy(memory);
}

// 串行写：把落盘动作排入队列，避免并发写互相覆盖（仿 snapshots commitQueue）。
function enqueuePersist() {
  const job = writeQueue.then(() => {
    memory.updatedAt = Date.now();
    try {
      writeMemoryFile(memory);
    } catch (err) {
      console.error('[memory] 落盘失败（需修复的 bug，非正常状态）:', err.message);
      throw err;
    }
  });
  writeQueue = job.catch(() => {});
  return job;
}

function pushEvent(type, payload) {
  memory.events.push({ type, at: Date.now(), ...payload });
  if (memory.events.length > MAX_EVENTS) {
    memory.events.splice(0, memory.events.length - MAX_EVENTS);
  }
}

function touchPage(nodeId, fields) {
  const now = Date.now();
  const page = memory.pages[nodeId] || {
    nodeId,
    sceneType: null,
    variantId: null,
    keywords: [],
    useCount: 0,
    revertCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  Object.assign(page, fields, { updatedAt: now });
  memory.pages[nodeId] = page;
  return page;
}

// 唯一写编排入口：仅在 decision 表示应用成功时更新画像与页面。
export function recordInteraction({ interaction = {}, decision = {}, currentNode = {}, variant = null, variantDeviation = null, traceId = null } = {}) {
  ensureLoaded();
  if (decision.shouldUpdate === false) {
    return Promise.resolve(false); // 失败/不更新不污染画像
  }
  const nodeId = decision.nodeId || currentNode.nodeId || 'main';
  const sceneType = interaction?.currentCapabilities?.sceneType || decision.sceneType || null;
  const variantId = variant?.id || interaction?.requestedVariantId || null;
  const text = [interaction?.text, decision.intent, decision.title].filter(Boolean).join(' ');

  memory.preferences = updateProfile(memory.preferences, { sceneType, variantId, text, action: decision.action, variantDeviation });

  const keywords = extractKeywords(text);
  const prev = memory.pages[nodeId];
  touchPage(nodeId, {
    sceneType: sceneType || prev?.sceneType || null,
    variantId: variantId || prev?.variantId || null,
    keywords: [...new Set([...(prev?.keywords || []), ...keywords])].slice(0, 12),
    useCount: (prev?.useCount || 0) + 1,
  });
  pushEvent('interaction', { nodeId, sceneType, variantId, variantDeviation, traceId });
  return enqueuePersist().then(() => true);
}

// 负反馈：页面 revertCount++ 且 variantReverts++。
export function recordRevert({ nodeId, variantId = null, traceId = null } = {}) {
  ensureLoaded();
  const prev = memory.pages[nodeId];
  const vId = variantId || prev?.variantId || null;
  touchPage(nodeId || 'main', { revertCount: (prev?.revertCount || 0) + 1 });
  for (const asset of Object.values(memory.assets)) {
    if ((asset.usedByNodes || []).includes(nodeId)) {
      asset.revertCostCount = Number(asset.revertCostCount || 0) + 1;
      asset.updatedAt = Date.now();
    }
  }
  if (vId) {
    memory.preferences.variantReverts[vId] = (memory.preferences.variantReverts[vId] || 0) + 1;
  }
  pushEvent('revert', { nodeId, variantId: vId, traceId });
  return enqueuePersist();
}

// 资产使用：写前过白名单，非法仅记 event 警告不入索引；合法写 AssetMemory 并交叉引用。
export function recordAssetUsage({ nodeId, assets = [] } = {}) {
  ensureLoaded();
  for (const asset of assets) {
    const url = asset?.url;
    if (!isAllowedAssetUrl(url)) {
      console.warn('[memory] 资产 URL 不在白名单，跳过索引:', url);
      pushEvent('asset_rejected', { nodeId, url: url || null });
      continue;
    }
    const now = Date.now();
    const rec = ensureAssetRecord(url, { type: asset.type || null });
    rec.useCount += 1;
    if (nodeId && !rec.usedByNodes.includes(nodeId)) rec.usedByNodes.push(nodeId);
    rec.updatedAt = now;
    rec.lastUsedAt = now;
  }
  return enqueuePersist();
}

export function recordAssetIssueSignal({ url, type = null, traceId = null } = {}) {
  ensureLoaded();
  if (!isAllowedAssetUrl(url)) {
    pushEvent('asset_issue_rejected', { url: url || null, traceId });
    return Promise.resolve(false);
  }
  const now = Date.now();
  const rec = ensureAssetRecord(url, { type });
  rec.issueCount += 1;
  rec.lastIssueAt = now;
  rec.updatedAt = now;
  pushEvent('asset_issue', { url, traceId });
  return enqueuePersist().then(() => true);
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

export function scoreAssetQuality(asset = {}, { now = Date.now() } = {}) {
  const use = Math.max(0, Number(asset?.useCount || 0));
  const coverage = Array.isArray(asset?.usedByNodes) ? asset.usedByNodes.length : 0;
  const lastUsedAt = Number(asset?.lastUsedAt || asset?.updatedAt || 0);
  const ageDays = lastUsedAt > 0 ? Math.max(0, (now - lastUsedAt) / (24 * 60 * 60 * 1000)) : Infinity;
  const recency = Number.isFinite(ageDays) ? Math.max(0, 1 - ageDays / 30) : 0;
  const components = {
    use,
    coverage,
    recency: round3(recency),
  };
  return {
    score: round3(components.use + components.coverage + components.recency),
    components,
  };
}

export function getPreferenceProfile() {
  ensureLoaded();
  return derivePreference(memory.preferences);
}

export function getPageMemory(nodeId) {
  ensureLoaded();
  return memory.pages[nodeId] ? deepCopy(memory.pages[nodeId]) : null;
}

// 相似度召回：按 sceneType 命中 + 关键词重合度排序。
export function findRelatedPages(interaction = {}, { limit = 3 } = {}) {
  ensureLoaded();
  const sceneType = interaction?.currentCapabilities?.sceneType || null;
  const kw = extractKeywords([interaction?.text, interaction?.targetLabel].filter(Boolean).join(' '));
  const scored = Object.values(memory.pages)
    .map((p) => {
      let score = 0;
      if (sceneType && p.sceneType === sceneType) score += 2;
      score += (p.keywords || []).filter((k) => kw.includes(k)).length;
      return { page: deepCopy(p), score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || (b.page.useCount || 0) - (a.page.useCount || 0));
  return scored.slice(0, limit).map((x) => x.page);
}

export function listAssetsByNode(nodeId) {
  ensureLoaded();
  return Object.values(memory.assets)
    .filter((a) => (a.usedByNodes || []).includes(nodeId))
    .map((a) => deepCopy(a));
}

// 仅供测试：重置内存单例与写队列，对齐 presetRegistry 测试钩子风格。
export function __resetMemoryForTest() {
  memory = null;
  loaded = false;
  writeQueue = Promise.resolve();
}
