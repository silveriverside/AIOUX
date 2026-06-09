// 记忆模块底层 IO：memory.json 的读取与原子写入。
// 纯 IO，无业务逻辑。文件损坏时 catch + warn + 返回默认空结构（仿 graph.js）。
import fs from 'node:fs';
import path from 'node:path';
import { ROOT_DIR } from './config.js';

// 解析 memory.json 路径。
// 为支持测试隔离，运行时根据当前 AIOUX_SNAPSHOTS_DIR 实时计算，
// 这样测试在 import 后再设环境变量也能命中临时目录。
export function resolveMemoryFile() {
  const dir = process.env.AIOUX_SNAPSHOTS_DIR
    ? path.resolve(process.env.AIOUX_SNAPSHOTS_DIR)
    : path.join(ROOT_DIR, 'snapshots');
  return path.join(dir, 'memory.json');
}

// 默认空记忆结构。
export function createEmptyMemory() {
  const now = Date.now();
  return {
    version: 1,
    updatedAt: now,
    pages: {}, // nodeId -> PageMemory
    assets: {}, // assetKey -> AssetMemory
    preferences: {
      sceneTypeCounts: {},
      variantCounts: {},
      variantReverts: {},
      keywordCounts: {},
      motionAffinity: 0,
      threeDAffinity: 0,
      totalSignals: 0,
      updatedAt: now,
    },
    events: [], // 环形缓冲（由门面层限长）
  };
}

// 读取 memory.json：不存在或解析失败 → warn + 返回默认空结构。
export function loadMemoryFile() {
  const file = resolveMemoryFile();
  if (!fs.existsSync(file)) {
    return createEmptyMemory();
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!parsed || typeof parsed !== 'object') {
      console.warn('[memory] memory.json 内容非对象，重建空记忆');
      return createEmptyMemory();
    }
    // 与默认结构做浅层补全，容忍旧版本缺字段。
    const base = createEmptyMemory();
    return {
      ...base,
      ...parsed,
      pages: parsed.pages && typeof parsed.pages === 'object' ? parsed.pages : {},
      assets: parsed.assets && typeof parsed.assets === 'object' ? parsed.assets : {},
      preferences: { ...base.preferences, ...(parsed.preferences || {}) },
      events: Array.isArray(parsed.events) ? parsed.events : [],
    };
  } catch (err) {
    console.warn('[memory] memory.json 解析失败，重建空记忆:', err.message);
    return createEmptyMemory();
  }
}

// 原子写：写临时文件再 rename，避免半写损坏。
export function writeMemoryFile(mem) {
  const file = resolveMemoryFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(mem, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}
