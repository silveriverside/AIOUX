// 偏好画像纯函数：根据交互信号更新计数、提取关键词、派生偏好。
// 零 IO，全部可单测。signal 形如 { sceneType, variantId, text, action, reverted }。

// 动效偏好词（动效 = motion/animation，含视差、GSAP 等动画库语义）。
const MOTION_KEYWORDS = ['动效', '动画', '视差', 'gsap', 'motion', '过渡', '滚动动画'];
// 3D 偏好词（3D = three-dimensional 三维，含 WebGL = Web Graphics Library）。
const THREED_KEYWORDS = ['3d', 'webgl', '空间', '旋转', '立体', '三维'];
// 通用偏好关键词表（命中即计入 keywordCounts，中英文混合）。
const PREFERENCE_KEYWORDS = [
  '科技', '极简', '复古', '未来', '暗黑', '明亮', '渐变', '霓虹', '手绘',
  '卡片', '地图', '时间线', '海报', '沉浸', '电影', '粒子', '玻璃',
  'minimal', 'retro', 'futuristic', 'dark', 'neon', 'gradient', 'glass',
  ...MOTION_KEYWORDS,
  ...THREED_KEYWORDS,
];

// 从文本提取偏好关键词（预设词表命中即可，去重）。
export function extractKeywords(text) {
  if (!text || typeof text !== 'string') return [];
  const lower = text.toLowerCase();
  const hits = [];
  for (const kw of PREFERENCE_KEYWORDS) {
    if (lower.includes(kw.toLowerCase()) && !hits.includes(kw)) hits.push(kw);
  }
  return hits;
}

function bump(map, key, by = 1) {
  if (!key) return;
  map[key] = (map[key] || 0) + by;
}

// 根据 signal 更新画像并返回新 profile（不可变更新，便于单测对比）。
export function updateProfile(profile, signal = {}) {
  const base = profile && typeof profile === 'object' ? profile : {};
  const next = {
    sceneTypeCounts: { ...(base.sceneTypeCounts || {}) },
    variantCounts: { ...(base.variantCounts || {}) },
    variantReverts: { ...(base.variantReverts || {}) },
    keywordCounts: { ...(base.keywordCounts || {}) },
    motionAffinity: base.motionAffinity || 0,
    threeDAffinity: base.threeDAffinity || 0,
    totalSignals: base.totalSignals || 0,
    updatedAt: Date.now(),
  };

  const { sceneType, variantId, text, reverted } = signal;
  if (sceneType) bump(next.sceneTypeCounts, sceneType);
  // reverted 信号是纯负反馈：只累加 variantReverts，不累加 variantCounts，
  // 这样 derivePreference 的净分（count - reverts）会随回退下降。
  if (variantId) {
    if (reverted) bump(next.variantReverts, variantId);
    else bump(next.variantCounts, variantId);
  }

  if (text && typeof text === 'string') {
    const lower = text.toLowerCase();
    if (MOTION_KEYWORDS.some((k) => lower.includes(k.toLowerCase()))) next.motionAffinity += 1;
    if (THREED_KEYWORDS.some((k) => lower.includes(k.toLowerCase()))) next.threeDAffinity += 1;
    for (const kw of extractKeywords(text)) bump(next.keywordCounts, kw);
  }

  next.totalSignals += 1;
  return next;
}

// 把计数对象按值降序取 topN，返回 [{ key, count }]。
function topEntries(counts, n) {
  return Object.entries(counts || {})
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}

// 派生偏好：topVariants 以 (count - reverts) 净分排序。
export function derivePreference(profile, { limit = 5 } = {}) {
  const p = profile && typeof profile === 'object' ? profile : {};
  const variantCounts = p.variantCounts || {};
  const variantReverts = p.variantReverts || {};
  const topVariants = Object.keys(variantCounts)
    .map((id) => ({
      key: id,
      count: variantCounts[id] || 0,
      reverts: variantReverts[id] || 0,
      net: (variantCounts[id] || 0) - (variantReverts[id] || 0),
    }))
    .sort((a, b) => b.net - a.net || b.count - a.count)
    .slice(0, limit);

  return {
    topSceneTypes: topEntries(p.sceneTypeCounts, limit),
    topVariants,
    topKeywords: topEntries(p.keywordCounts, limit),
    motionAffinity: p.motionAffinity || 0,
    threeDAffinity: p.threeDAffinity || 0,
    totalSignals: p.totalSignals || 0,
  };
}
