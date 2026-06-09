// 记忆摘要纯函数：把偏好画像与相关历史格式化为可注入模型的文本块。
// 仅设计，暂不在 intent.js 接线。空记忆/冷启动返回 text:''（可被 .filter(Boolean) 忽略）。
import { getPreferenceProfile, findRelatedPages, getPageMemory } from './memory.js';

const DISCLAIMER = '以上仅作个性化参考，与用户当前明确诉求冲突时以诉求为准。';

/**
 * @param {object} interaction 当前交互
 * @param {object} currentNode { nodeId, title }
 * @param {object} opts 可注入 { profile, relatedPages } 以保持纯函数可测；缺省则从 memory 读取
 * @returns {{ text: string, used: boolean }}
 */
export function buildMemorySection(interaction = {}, currentNode = {}, opts = {}) {
  const profile = opts.profile || getPreferenceProfile();
  const related = opts.relatedPages || findRelatedPages(interaction, { limit: 3 });
  const pageMem = opts.pageMemory !== undefined
    ? opts.pageMemory
    : (currentNode.nodeId ? getPageMemory(currentNode.nodeId) : null);

  // 冷启动：无任何信号则不输出。
  if (!profile || !profile.totalSignals) {
    return { text: '', used: false };
  }

  const lines = ['【个性化记忆参考】'];

  if (profile.topSceneTypes.length) {
    lines.push(`常用场景: ${profile.topSceneTypes.map((s) => `${s.key}(${s.count})`).join('、')}`);
  }
  if (profile.topKeywords.length) {
    lines.push(`偏好风格关键词: ${profile.topKeywords.map((k) => k.key).join('、')}`);
  }
  if (profile.motionAffinity > 0) {
    lines.push(`动效偏好: 较高（累计 ${profile.motionAffinity} 次相关信号）`);
  }
  if (profile.threeDAffinity > 0) {
    lines.push(`3D 偏好: 较高（累计 ${profile.threeDAffinity} 次相关信号）`);
  }
  if (profile.topVariants.length) {
    lines.push(`偏好变体: ${profile.topVariants.map((v) => `${v.key}(净分${v.net})`).join('、')}`);
  }
  if (pageMem) {
    lines.push(`当前节点相关历史: 使用 ${pageMem.useCount || 0} 次，回退 ${pageMem.revertCount || 0} 次` +
      (pageMem.keywords?.length ? `，关键词 ${pageMem.keywords.join('、')}` : ''));
  }
  if (Array.isArray(related) && related.length) {
    lines.push(`相关历史页面: ${related.map((p) => p.nodeId).join('、')}`);
  }

  lines.push(DISCLAIMER);
  return { text: lines.join('\n'), used: true };
}
