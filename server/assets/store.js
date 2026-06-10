// 本地素材库 + 缓存索引读写。
// ASSETS_DIR 在本文件内解析（不改 config.js，避免并行分支冲突）。
import fs from 'node:fs';
import path from 'node:path';
import { ROOT_DIR } from '../config.js';

// 素材根目录：仿照 config.js 的 AIOUX_SNAPSHOTS_DIR 模式，但只在本文件内解析。
export const ASSETS_DIR = process.env.AIOUX_ASSETS_DIR
  ? path.resolve(process.env.AIOUX_ASSETS_DIR)
  : path.join(ROOT_DIR, 'assets');

const LIBRARY_DIR = path.join(ASSETS_DIR, 'library');
const LIBRARY_INDEX_FILE = path.join(LIBRARY_DIR, 'index.json');
const CACHE_DIR = path.join(ASSETS_DIR, 'cache');
const CACHE_INDEX_FILE = path.join(CACHE_DIR, 'index.json');

// 进程内索引缓存：减少重复读盘，并让 putCached 基于最新内存态合并，避免同进程内丢更新。
let libraryIndexCache = null;
let libraryIndexMtimeMs = null;
let cacheIndexCache = null;
let cacheIndexMtimeMs = null;

/** 归一化关键词数组：小写、trim、去空、排序，保证乱序得同结果。 */
function normalizeKeywords(keywords) {
  const list = Array.isArray(keywords) ? keywords : keywords == null ? [] : [keywords];
  return list
    .map((k) => String(k || '').toLowerCase().trim())
    .filter(Boolean)
    .sort();
}

/**
 * 生成稳定缓存键：type | 归一化关键词join(',') | sizeHint。
 * @param {{type: string, keywords?: string[], sizeHint?: string}} param
 * @returns {string}
 */
export function makeCacheKey({ type, keywords, sizeHint } = {}) {
  const t = String(type || '').toLowerCase().trim();
  const kw = normalizeKeywords(keywords).join(',');
  return `${t}|${kw}|${sizeHint || ''}`;
}

/** 关键词命中打分（参考 presetRegistry 的 keywordScore）。 */
function keywordScore(text, keywords) {
  let score = 0;
  const lower = String(text || '').toLowerCase();
  for (const keyword of keywords) {
    if (keyword && lower.includes(String(keyword).toLowerCase())) score += 1;
  }
  return score;
}

/** 安全读取 JSON 文件；不存在或损坏返回 fallback 并 warn（不抛）。 */
function readJsonSafe(file, fallback, label) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    console.warn(`[assets] ${label} 解析失败，按空重建: ${file}`, err?.message || err);
    return fallback;
  }
}

/** 原子写 JSON：先写临时文件再 rename。 */
function writeJsonAtomic(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

/** 读取文件 mtime；不存在时返回 null。 */
function getFileMtimeMs(file) {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return null;
  }
}

/**
 * 读取本地素材库索引（数组）。不存在/损坏返回 []。
 * @returns {Array<object>}
 */
export function loadLibraryIndex() {
  const mtimeMs = getFileMtimeMs(LIBRARY_INDEX_FILE);
  if (libraryIndexCache && libraryIndexMtimeMs === mtimeMs) {
    return libraryIndexCache;
  }
  const data = readJsonSafe(LIBRARY_INDEX_FILE, [], 'library/index.json');
  libraryIndexCache = Array.isArray(data) ? data : [];
  libraryIndexMtimeMs = mtimeMs;
  return libraryIndexCache;
}

/**
 * 在本地库中按 type 过滤 + 关键词命中打分，返回最高分项（0 命中返回 null）。
 * @param {{type: string, keywords?: string[]}} param
 * @returns {object|null}
 */
export function findInLibrary({ type, keywords } = {}) {
  const index = loadLibraryIndex();
  const wanted = String(type || '').toLowerCase();
  const kw = normalizeKeywords(keywords);
  let best = null;
  let bestScore = 0;
  for (const item of index) {
    if (wanted && String(item.type || '').toLowerCase() !== wanted) continue;
    const haystack = [item.title, item.description, ...(item.tags || [])].join(' ');
    const score = keywordScore(haystack, kw);
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }
  return best;
}

/**
 * 读取缓存索引（对象：cacheKey -> CacheEntry）。不存在/损坏返回 {}。
 * @returns {Record<string, object>}
 */
export function loadCacheIndex() {
  const mtimeMs = getFileMtimeMs(CACHE_INDEX_FILE);
  if (cacheIndexCache && cacheIndexMtimeMs === mtimeMs) {
    return cacheIndexCache;
  }
  const data = readJsonSafe(CACHE_INDEX_FILE, {}, 'cache/index.json');
  cacheIndexCache = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  cacheIndexMtimeMs = mtimeMs;
  return cacheIndexCache;
}

/**
 * 取单条缓存项。
 * @param {string} cacheKey
 * @returns {object|null}
 */
export function getCached(cacheKey) {
  if (!cacheKey) return null;
  const index = loadCacheIndex();
  return index[cacheKey] || null;
}

/**
 * 写入/更新一条缓存项：内存合并 + 原子持久化。
 * @param {object} entry CacheEntry，需含 cacheKey
 * @returns {object} 落盘后的 entry
 */
export function putCached(entry) {
  if (!entry || !entry.cacheKey) {
    throw new Error('putCached 需要 entry.cacheKey');
  }
  const index = loadCacheIndex();
  const merged = {
    cacheKey: entry.cacheKey,
    resolvedUrl: entry.resolvedUrl || '',
    source: entry.source || '',
    type: entry.type || '',
    keywords: entry.keywords || [],
    hits: typeof entry.hits === 'number' ? entry.hits : 0,
    lastVerifiedAt: entry.lastVerifiedAt || Date.now(),
    status: entry.status || 'ok', // ok | stale | broken
  };
  index[entry.cacheKey] = merged;
  writeJsonAtomic(CACHE_INDEX_FILE, index);
  cacheIndexCache = index;
  cacheIndexMtimeMs = getFileMtimeMs(CACHE_INDEX_FILE);
  return merged;
}

/** 仅供测试使用：清空进程内索引缓存。 */
export function __resetStoreCacheForTest() {
  libraryIndexCache = null;
  libraryIndexMtimeMs = null;
  cacheIndexCache = null;
  cacheIndexMtimeMs = null;
}
