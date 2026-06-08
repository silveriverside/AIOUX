// 通用「skill → preset」适配层与注册表。
//
// 目标：把任意标准 skill 的方法论萃取为标准化的「预设变体」，
// 让前端生成在不同场景选用不同 skill 风格，而不是把某个 skill 硬编码进生成主流程。
//
// 设计要点：
// - 同一 sceneType 下允许多个变体（如 3D 的纯 CSS 轻量版 / three.js WebGL 版 / GSAP 强动效版）。
// - 新增或更新 skill 时，只需新增/更新一个 variant 条目，不改生成主流程。
// - 选择器支持：模型/上层显式指定 variantId，关键词加权，sceneType 兜底。
// - 与现有 EXPERIENCE_PRESETS 完全兼容：默认以其为种子注册基础变体。

import { EXPERIENCE_PRESETS } from './presets.js';
import { ALLOWED_ASSET_DOMAINS } from './config.js';

/**
 * @typedef {Object} PresetVariant
 * @property {string} id            变体唯一标识，建议 `${sceneType}__${variantKey}`。
 * @property {string} sceneType     归属场景类型，如 interactive_3d。
 * @property {string} name          人类可读名称。
 * @property {string} skillSource   来源 skill 标识与版本，如 'frontend-design' 或 'gsap-scrolltrigger@3'。
 * @property {string[]} techStack   该变体允许/建议的库与外链来源（描述用途，便于审计）。
 * @property {string[]} keywords    选择加权关键词（小写）。
 * @property {string} promptSection 注入模型的生成准则（从 skill 萃取）。
 * @property {string[]} acceptance  可量化验收点，供评测与 timing 记录。
 * @property {boolean} enabled      是否启用，便于将来新增/停用。
 * @property {number} priority      同分时的排序权重，越大越优先。
 */

const registry = new Map();

function normalizeText(interaction) {
  return [
    interaction?.text,
    interaction?.gesture,
    interaction?.targetLabel,
    interaction?.type,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function keywordScore(text, keywords) {
  let score = 0;
  for (const keyword of keywords) {
    if (keyword && text.includes(keyword.toLowerCase())) score += 1;
  }
  return score;
}

/**
 * 注册或覆盖一个预设变体。
 * @param {PresetVariant} variant
 * @returns {PresetVariant} 规整后的变体
 */
export function registerPresetVariant(variant) {
  if (!variant || typeof variant.id !== 'string' || !variant.id) {
    throw new Error('preset variant 缺少有效 id');
  }
  if (typeof variant.sceneType !== 'string' || !variant.sceneType) {
    throw new Error(`preset variant ${variant.id} 缺少 sceneType`);
  }
  if (typeof variant.promptSection !== 'string' || !variant.promptSection.trim()) {
    throw new Error(`preset variant ${variant.id} 缺少 promptSection`);
  }
  const normalized = {
    id: variant.id,
    sceneType: variant.sceneType,
    name: variant.name || variant.id,
    skillSource: variant.skillSource || 'builtin',
    techStack: Array.isArray(variant.techStack) ? variant.techStack : [],
    keywords: Array.isArray(variant.keywords) ? variant.keywords.map((k) => String(k).toLowerCase()) : [],
    promptSection: variant.promptSection,
    acceptance: Array.isArray(variant.acceptance) ? variant.acceptance : [],
    enabled: variant.enabled !== false,
    priority: typeof variant.priority === 'number' ? variant.priority : 0,
  };
  registry.set(normalized.id, normalized);
  return normalized;
}

/** 取得单个变体（含未启用）。 */
export function getPresetVariant(id) {
  return registry.get(id) || null;
}

/** 列出变体；默认仅启用项，可按 sceneType 过滤。 */
export function listPresetVariants({ sceneType = null, includeDisabled = false } = {}) {
  const all = [...registry.values()];
  return all.filter((v) => {
    if (!includeDisabled && !v.enabled) return false;
    if (sceneType && v.sceneType !== sceneType) return false;
    return true;
  });
}

/** 列出已注册的全部 sceneType。 */
export function listSceneTypes() {
  return [...new Set([...registry.values()].map((v) => v.sceneType))];
}

/**
 * 为一次交互选择预设变体。
 * 选择优先级：
 * 1. 显式 requestedVariantId（存在且启用）。
 * 2. 与 sceneType（来自 capabilities）匹配的变体里关键词得分最高者。
 * 3. 全量变体里关键词得分最高者。
 * 4. 兜底：第一个启用变体或 null。
 * @returns {{ primary: PresetVariant|null, candidates: PresetVariant[], reason: string }}
 */
export function selectPresetVariant(interaction, { requestedVariantId = null } = {}) {
  if (requestedVariantId) {
    const requested = registry.get(requestedVariantId);
    if (requested && requested.enabled) {
      return { primary: requested, candidates: [requested], reason: 'explicit' };
    }
  }

  const text = normalizeText(interaction);
  const sceneType = interaction?.currentCapabilities?.sceneType || null;

  const scoreOf = (v) => keywordScore(text, v.keywords);
  const rank = (list) =>
    [...list]
      .map((v) => ({ v, score: scoreOf(v) }))
      .sort((a, b) => b.score - a.score || b.v.priority - a.v.priority)
      .filter((x) => x.score > 0);

  // 2. 在当前 sceneType 内挑关键词最优。
  if (sceneType) {
    const scoped = listPresetVariants({ sceneType });
    const rankedScoped = rank(scoped);
    if (rankedScoped.length) {
      return {
        primary: rankedScoped[0].v,
        candidates: rankedScoped.map((x) => x.v),
        reason: 'scene_keyword',
      };
    }
    // sceneType 命中但无关键词得分：取该场景下优先级最高的启用变体。
    if (scoped.length) {
      const byPriority = [...scoped].sort((a, b) => b.priority - a.priority);
      return { primary: byPriority[0], candidates: byPriority, reason: 'scene_default' };
    }
  }

  // 3. 全量关键词最优。
  const rankedAll = rank(listPresetVariants());
  if (rankedAll.length) {
    return {
      primary: rankedAll[0].v,
      candidates: rankedAll.slice(0, 3).map((x) => x.v),
      reason: 'global_keyword',
    };
  }

  // 4. 兜底。
  const enabled = listPresetVariants();
  return {
    primary: enabled[0] || null,
    candidates: enabled.slice(0, 3),
    reason: enabled.length ? 'fallback_first' : 'empty',
  };
}

/** 把一个变体格式化为注入模型的文本块。 */
export function formatVariantBlock(variant) {
  return [
    `- ${variant.id} | ${variant.name}（来源: ${variant.skillSource}）`,
    `  场景: ${variant.sceneType}`,
    variant.techStack.length ? `  技术栈: ${variant.techStack.join('、')}` : null,
    `  生成准则: ${variant.promptSection}`,
    variant.acceptance.length ? `  验收: ${variant.acceptance.join('；')}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

/** 校验某个 URL 是否在外链素材白名单内。 */
export function isAllowedAssetUrl(url) {
  if (typeof url !== 'string' || !url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    const host = parsed.hostname.toLowerCase();
    return ALLOWED_ASSET_DOMAINS.some(
      (domain) => host === domain || host.endsWith(`.${domain}`)
    );
  } catch {
    return false;
  }
}

/** 仅供测试使用：清空注册表。 */
export function __resetRegistryForTest() {
  registry.clear();
}

// === 以现有 4 套体验范式为种子注册基础变体（向后兼容） ===
const SEED_META = {
  immersive_media: {
    skillSource: 'builtin:immersive_media',
    techStack: ['CSS 动画', 'canvas 粒子', 'text_to_image 生成图', '白名单外链图片/视频'],
    keywords: ['画面', '场景', '视角', '回望', '第一视角', '沉浸', '电影', '海报', '地出', 'earthrise'],
  },
  card_browser: {
    skillSource: 'builtin:card_browser',
    techStack: ['网格/滑轨布局', '白名单外链封面图', 'icon'],
    keywords: ['攻略', '清单', '合集', '列表', '筛选', '推荐', '卡片', '灵感'],
  },
  interactive_2d: {
    skillSource: 'builtin:interactive_2d',
    techStack: ['svg', 'canvas', '结构化 DOM'],
    keywords: ['地图', '时间线', '关系', '流程', '路线', '分布', '网络', '图谱', '2d'],
  },
  interactive_3d: {
    skillSource: 'builtin:interactive_3d',
    techStack: ['CSS 3D', 'canvas', 'svg 伪 3D'],
    keywords: ['地球', '空间站', '天体', '建筑', '旋转', '3d', '重力感应', '空间结构'],
  },
};

export function seedFromExperiencePresets() {
  for (const preset of EXPERIENCE_PRESETS) {
    const meta = SEED_META[preset.id] || { skillSource: `builtin:${preset.id}`, techStack: [], keywords: [] };
    const promptSection = [
      `审美方向: ${preset.aesthetic}`,
      `视觉目标: ${preset.visualGoals.join('；')}`,
      `布局规则: ${preset.layoutRules.join('；')}`,
      `交互规则: ${preset.interactionRules.join('；')}`,
      `素材策略: ${preset.mediaStrategy.join('；')}`,
    ].join('；');
    registerPresetVariant({
      id: `${preset.id}__builtin`,
      sceneType: preset.id,
      name: `${preset.name}（内置）`,
      skillSource: meta.skillSource,
      techStack: meta.techStack,
      keywords: meta.keywords,
      promptSection,
      acceptance: preset.acceptance,
      enabled: true,
      priority: 0,
    });
  }
}

// 模块加载即以现有范式为种子，保证开箱可用且向后兼容。
seedFromExperiencePresets();
