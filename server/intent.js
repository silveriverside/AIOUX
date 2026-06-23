// 意图编排：把交互事件 + 上下文组装为多模态 messages，并解析模型的混合输出
import { performance } from 'node:perf_hooks';
import { SYSTEM_PROMPT } from './prompt.js';
import { buildPresetContextText } from './presets.js';
import { selectPresetVariant, formatVariantBlock, listPresetVariants } from './presetRegistry.js';
import { buildMemorySection } from './memorySummary.js';

// 控制回传给模型的当前页 HTML 长度，避免上下文超限
const MAX_HTML_CHARS = 6000;

function truncateHtml(html) {
  if (!html) return '(空白欢迎页，尚无内容)';
  if (html.length <= MAX_HTML_CHARS) return html;
  return html.slice(0, MAX_HTML_CHARS) + `\n...(已截断，原长 ${html.length} 字符)`;
}

// 注入当前场景的全部候选变体，让模型按用户意图与「效果优先」自行选择，
// 而不是用关键词在服务端预先锁死单个变体。selectPresetVariant 仅作为兜底默认与可观测参考。
// 返回 { text, variant, reason, selectMs, meta }，其中 meta 是可观测用的精简变体信息。
function buildSelectedVariantSection(interaction) {
  const selectStart = performance.now();
  try {
    const sceneType = interaction?.currentCapabilities?.sceneType || null;
    const requestedVariantId = interaction?.requestedVariantId || null;
    const { primary, reason } = selectPresetVariant(interaction, { requestedVariantId });
    const selectMs = Math.round((performance.now() - selectStart) * 1000) / 1000;
    if (!primary) return { text: '', variant: null, reason, selectMs, meta: null };

    // 候选清单：优先列出当前场景的全部启用变体（效果优先：priority 高者在前）。
    // 无 sceneType 时回退到 primary 单条，避免把全量变体灌进 prompt。
    const scoped = sceneType ? listPresetVariants({ sceneType }) : [];
    const candidates = (scoped.length ? scoped : [primary])
      .slice()
      .sort((a, b) => b.priority - a.priority);

    const text = [
      '【本场景可选预设变体（请按用户意图与效果优先自行选择其一）】',
      ...candidates.map(formatVariantBlock),
      `服务端兜底建议: ${primary.id}（依据: ${reason}，仅供参考，可按效果优先覆盖）`,
      '【变体选择要求】',
      '- 效果优先：在满足用户意图的前提下，优先选择能达到最佳呈现效果的变体，不要因为实现简单而牺牲效果。',
      '- 真实几何体（地球/星球/天体/球体/真实产品模型等）必须选择真实 3D（WebGL/three.js）变体并用真实 3D 几何渲染，禁止用平面图 rotateY 冒充球体。',
      '- 伪 3D（纯 CSS 3D / GSAP）仅适用于卡片翻转、立方体、层叠视差、动效叙事等由平面元素空间编排的效果。',
      '- 在决策 JSON 中用 variantId 字段回报你最终选择的变体 id；若与用户明确诉求冲突，以用户诉求为准并在 reasoning 说明。',
    ].join('\n');

    const meta = {
      id: primary.id,
      name: primary.name,
      sceneType: primary.sceneType,
      skillSource: primary.skillSource,
      priority: primary.priority,
      reason,
      candidateIds: candidates.map((v) => v.id),
    };
    return { text, variant: primary, reason, selectMs, meta };
  } catch (err) {
    console.warn('[intent] 预设变体候选注入失败，回退到通用范式摘要:', err.message);
    const selectMs = Math.round((performance.now() - selectStart) * 1000) / 1000;
    return { text: '', variant: null, reason: 'error', selectMs, meta: null };
  }
}

/**
 * 组装发送给 step-3.5-flash 的多模态 messages。
 * @param {object} interaction - 前端归一化的交互事件
 *   { type, text, gesture, point, selection, audio:{dataUrl,format}, image:{dataUrl} }
 * @param {object} currentNode - { nodeId, title, html }
 * @param {Array} graphSummary - [{ nodeId, title, parentId }]
 * @param {object} [observe] - 可选观测回填对象；传入时写入 observe.variant 与 observe.selectMs。
 *   默认 null 时行为与改造前完全一致（纯增量、不影响 prompt 内容）。
 */
export function buildMessages(interaction, currentNode, graphSummary, observe = null) {
  const presetContext = buildPresetContextText(interaction);
  const selected = buildSelectedVariantSection(interaction);
  const memorySection = buildMemorySection(interaction, currentNode);
  if (observe && typeof observe === 'object') {
    observe.variant = selected.meta;
    observe.selectMs = selected.selectMs;
  }
  const contextText = [
    `【当前节点】nodeId=${currentNode.nodeId} title=${currentNode.title}`,
    `【当前页面 HTML】\n${truncateHtml(currentNode.html)}`,
    `【已存在节点列表（可作为 navigate 目标）】\n${JSON.stringify(graphSummary, null, 0)}`,
    presetContext,
    selected.text,
    memorySection.text,
    `【本次交互】\n${describeInteraction(interaction)}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  // 多模态 content：文本上下文 + 可选的图片/音频
  const userContent = [{ type: 'text', text: contextText }];

  if (interaction.image?.dataUrl) {
    userContent.push({
      type: 'image_url',
      image_url: { url: interaction.image.dataUrl, detail: 'high' },
    });
  }
  if (interaction.audio?.dataUrl) {
    userContent.push({
      type: 'input_audio',
      input_audio: { data: interaction.audio.dataUrl },
    });
  }

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userContent },
  ];
}

// 把结构化交互事件转为模型可读的自然语言描述
function describeInteraction(it) {
  const parts = [`交互类型: ${it.type || 'unknown'}`];
  if (it.text) parts.push(`文本输入: "${it.text}"`);
  if (it.gesture) parts.push(`手势: ${it.gesture}`);
  if (it.point) parts.push(`坐标(归一化0-1): x=${it.point.x?.toFixed(3)}, y=${it.point.y?.toFixed(3)}`);
  if (it.targetLabel) parts.push(`命中元素: ${it.targetLabel}`);
  if (it.intentHint) parts.push(`前端意图提示: ${it.intentHint}（local_native=本地已处理；refine_current=优先细化当前页；create_or_navigate=优先创建子页或跳转）`);
  if (it.intentHint === 'refine_current') {
    parts.push('意图路由要求: 除非用户明确要求进入新主题，否则 action 必须优先 stay，nodeId 必须保持当前节点。');
  } else if (it.intentHint === 'create_or_navigate') {
    parts.push('意图路由要求: 用户倾向进入新主题或已有节点。若已有节点匹配则 navigate，否则 create 子节点。');
  } else if (it.intentHint === 'model_decide') {
    parts.push('意图路由要求: 请先判断是当前页细化还是新主题探索。细化/改风格/加图层用 stay，进入详情/专题/新对象用 create 或 navigate。');
  }
  if (it.currentCapabilities) {
    const caps = it.currentCapabilities;
    parts.push(
      `当前页能力: sceneType=${caps.sceneType || 'generic'} nativeInteractions=${(caps.nativeInteractions || []).join('|') || 'none'} refinableAspects=${(caps.refinableAspects || []).join('|') || 'none'}`
    );
    if (Array.isArray(caps.explorableTargets) && caps.explorableTargets.length) {
      parts.push(`当前页可探索热点: ${caps.explorableTargets.join('、')}`);
    }
  }
  if (it.selection) {
    if (it.selection.rect) {
      const r = it.selection.rect;
      parts.push(`框选区域(归一化): x=${r.x.toFixed(3)} y=${r.y.toFixed(3)} w=${r.w.toFixed(3)} h=${r.h.toFixed(3)}`);
    }
    if (it.selection.path) {
      parts.push(`圈选路径点数: ${it.selection.path.length}（套索选区）`);
    }
  }
  if (it.audio) parts.push('附带了一段语音（见 input_audio），请直接理解语音内容作为意图。');
  if (it.image) parts.push('附带了一张摄像头/场景图片（见 image_url），请结合画面理解意图。');
  return parts.join('\n');
}

// 期望的标准字段名列表
const EXPECTED_KEYS = [
  'shouldUpdate', 'action', 'nodeId', 'parentId', 'title',
  'intent', 'reasoning', 'mode', 'html', 'patches', 'variantId',
];
const RESERVED_ACTION_VALUES = new Set(['stay', 'navigate', 'create']);

function extractBalancedJsonCandidates(text) {
  const candidates = [];
  let inString = false;
  let escape = false;
  let start = -1;
  const stack = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\') {
      if (inString) escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === '{' || ch === '[') {
      if (stack.length === 0) start = i;
      stack.push(ch);
      continue;
    }
    if (ch !== '}' && ch !== ']') continue;

    const opener = stack[stack.length - 1];
    if ((ch === '}' && opener !== '{') || (ch === ']' && opener !== '[')) {
      stack.length = 0;
      start = -1;
      continue;
    }

    stack.pop();
    if (stack.length === 0 && start >= 0) {
      candidates.push({ text: text.slice(start, i + 1), start, end: i + 1 });
      start = -1;
    }
  }

  return candidates;
}

function isLikelyDecisionObject(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  const action = typeof obj.action === 'string' ? obj.action.replace(/[{\s]+$/g, '') : obj.action;
  const mode = typeof obj.mode === 'string' ? obj.mode.replace(/[{\s]+$/g, '') : obj.mode;
  if (typeof obj.shouldUpdate !== 'boolean') return false;
  if (!['stay', 'navigate', 'create'].includes(action)) return false;
  if (!['full', 'patch'].includes(mode)) return false;
  if (mode === 'patch' && !Array.isArray(obj.patches)) return false;
  return true;
}

function hasUnclosedJsonStart(text) {
  let inString = false;
  let escape = false;
  const stack = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\') {
      if (inString) escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === '{' || ch === '[') {
      stack.push(ch);
      continue;
    }
    if (ch !== '}' && ch !== ']') continue;

    const opener = stack[stack.length - 1];
    if ((ch === '}' && opener === '{') || (ch === ']' && opener === '[')) {
      stack.pop();
    }
  }

  return stack.length > 0;
}

function findDuplicateTopLevelKeys(text) {
  const keys = [];
  let inString = false;
  let escape = false;
  let current = '';
  let stringStart = -1;
  let depth = 0;
  let expectingKey = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escape) {
      if (inString) current += ch;
      escape = false;
      continue;
    }
    if (ch === '\\') {
      if (inString) {
        current += ch;
        escape = true;
      }
      continue;
    }
    if (ch === '"') {
      if (inString) {
        inString = false;
        if (depth === 1 && expectingKey) {
          let j = i + 1;
          while (/\s/.test(text[j] || '')) j += 1;
          if (text[j] === ':') {
            try {
              keys.push(JSON.parse(text.slice(stringStart, i + 1)));
            } catch {
              keys.push(current);
            }
            expectingKey = false;
          }
        }
        current = '';
        stringStart = -1;
      } else {
        inString = true;
        current = '';
        stringStart = i;
      }
      continue;
    }
    if (inString) {
      current += ch;
      continue;
    }
    if (ch === '{' || ch === '[') {
      depth += 1;
      if (ch === '{' && depth === 1) expectingKey = true;
      continue;
    }
    if (ch === '}' || ch === ']') {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth === 1 && ch === ',') {
      expectingKey = true;
    }
  }

  const seen = new Set();
  return keys.filter((key) => {
    if (!EXPECTED_KEYS.includes(key)) return false;
    if (seen.has(key)) return true;
    seen.add(key);
    return false;
  });
}

function selectJsonCandidate(rawText) {
  const candidates = extractBalancedJsonCandidates(rawText);
  if (candidates.length === 0) return { text: rawText, mixedContent: false, multipleCandidates: false };
  if (candidates.length === 1 && candidates[0].text.trim() === rawText) {
    return { text: rawText, mixedContent: false, multipleCandidates: false };
  }

  const lastCandidate = candidates[candidates.length - 1];
  if (lastCandidate && hasUnclosedJsonStart(rawText.slice(lastCandidate.end))) {
    return {
      text: '',
      mixedContent: true,
      multipleCandidates: candidates.length > 1,
      trailingTruncatedCandidate: true,
    };
  }

  const validDecisionCandidates = [];
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate.text);
      if (isLikelyDecisionObject(parsed)) {
        validDecisionCandidates.push(candidate);
      }
    } catch {
      // 继续尝试下一个候选。
    }
  }

  if (validDecisionCandidates.length > 1) {
    return {
      text: '',
      mixedContent: true,
      multipleCandidates: true,
      ambiguousDecisionCandidates: true,
    };
  }
  if (validDecisionCandidates.length === 1) {
    const candidate = validDecisionCandidates[0];
    return {
      text: candidate.text,
      mixedContent: candidate.text.trim() !== rawText,
      multipleCandidates: candidates.length > 1,
    };
  }
  if (candidates.length > 1) {
    return {
      text: '',
      mixedContent: true,
      multipleCandidates: true,
      noUniqueDecisionCandidate: true,
    };
  }
  if (candidates[0].text.trim() !== rawText) {
    return {
      text: '',
      mixedContent: true,
      multipleCandidates: false,
      noValidMixedDecisionCandidate: true,
    };
  }

  return {
    text: candidates[0].text,
    mixedContent: candidates[0].text.trim() !== rawText,
    multipleCandidates: candidates.length > 1,
  };
}

/**
 * 对模型损坏的字段名进行模糊匹配修复。
 * 已知损坏模式：空字符串 key、多余尾部字符（如 nodeId{、parentId{）等。
 */
function fuzzyRepairKeys(obj) {
  const keys = Object.keys(obj);
  const fixed = {};
  const used = new Set();
  let dirty = false;

  for (const key of keys) {
    if (EXPECTED_KEYS.includes(key)) {
      fixed[key] = obj[key];
      used.add(key);
      continue;
    }

    // 空 key：按值类型和顺序推断
    if (key === '') {
      dirty = true;
      const val = obj[key];
      if (typeof val === 'boolean' && !used.has('shouldUpdate')) {
        fixed.shouldUpdate = val;
        used.add('shouldUpdate');
      } else if (['stay', 'navigate', 'create'].includes(val) && !used.has('action')) {
        fixed.action = val;
        used.add('action');
      } else if (typeof val === 'string' && !used.has('nodeId') && !RESERVED_ACTION_VALUES.has(val)) {
        fixed.nodeId = val;
        used.add('nodeId');
      } else if (typeof val === 'string' && !used.has('html')) {
        fixed.html = val;
        used.add('html');
      }
      continue;
    }

    // 模糊匹配：找最长公共前缀或包含关系
    let best = null;
    let bestScore = 0;
    for (const exp of EXPECTED_KEYS) {
      if (used.has(exp)) continue;
      // key 以 exp 开头（如 nodeId{ -> nodeId）
      if (key.startsWith(exp)) {
        const score = exp.length;
        if (score > bestScore) {
          best = exp;
          bestScore = score;
        }
      }
      // exp 以 key 开头（如 nodeId 被截断为 nodeId）已在上面的 startsWith 覆盖
      // key 包含 exp
      else if (key.includes(exp)) {
        const score = exp.length * 0.5;
        if (score > bestScore) {
          best = exp;
          bestScore = score;
        }
      }
    }

    if (best) {
      dirty = true;
      fixed[best] = obj[key];
      used.add(best);
      continue;
    }

    // 兜底：无法识别的 key，尝试从 key 名和值类型推断 shouldUpdate / action
    dirty = true;
    const val = obj[key];
    if (typeof val === 'boolean' && !used.has('shouldUpdate')) {
      fixed.shouldUpdate = val;
      used.add('shouldUpdate');
    } else if (['stay', 'navigate', 'create'].includes(val) && !used.has('action')) {
      fixed.action = val;
      used.add('action');
    } else if (typeof val === 'string' && !used.has('html') && val.trim().startsWith('<')) {
      fixed.html = val;
      used.add('html');
    } else if (
      typeof val === 'string' &&
      !used.has('nodeId') &&
      !val.includes('<') &&
      !RESERVED_ACTION_VALUES.has(val)
    ) {
      fixed.nodeId = val;
      used.add('nodeId');
    } else {
      // key 名本身可能包含 boolean 信息（如 `:true,`）
      if ((key.includes('true') || key.includes('false')) && !used.has('shouldUpdate')) {
        fixed.shouldUpdate = key.includes('true');
        used.add('shouldUpdate');
      }
      // 保留未识别的字段
      fixed[key] = val;
    }
  }

  return { fixed, dirty };
}

/**
 * 解析模型返回的混合输出 JSON。
 * 解析失败时返回降级结果（shouldUpdate=false）并带 error，绝不静默吞错。
 * 额外处理字段名丢失的模型 bug（空字符串 key、错位字符等恢复）。
 */
export function parseHybridOutput(raw, currentNode) {
  const rawText = raw.trim();
  const selectedJson = selectJsonCandidate(rawText);
  let jsonText = selectedJson.text.trim();
  // 标记：JSON 因截断而被"补后缀"修复成功——这类内容本质不完整、不可信，不应落地提交。
  let truncatedRepair = false;
  const mixedContent = selectedJson.mixedContent;
  const multipleCandidates = selectedJson.multipleCandidates;
  if (selectedJson.trailingTruncatedCandidate) {
    return {
      ok: false,
      error: '模型输出尾部包含疑似截断的 JSON 决策候选（待修复 bug），已阻止落地。',
      decision: {
        shouldUpdate: false,
        action: 'stay',
        nodeId: currentNode.nodeId,
        parentId: null,
        title: currentNode.title,
        intent: '(解析失败)',
        reasoning: '模型返回的最终决策 JSON 疑似被截断',
        mode: 'full',
        html: '',
        patches: [],
      },
    };
  }
  if (selectedJson.ambiguousDecisionCandidates) {
    return {
      ok: false,
      error: '模型输出包含多个合法 JSON 决策候选（待修复 bug）：无法可靠判断最终决策，已阻止落地。',
      decision: {
        shouldUpdate: false,
        action: 'stay',
        nodeId: currentNode.nodeId,
        parentId: null,
        title: currentNode.title,
        intent: '(解析失败)',
        reasoning: '模型返回了多个可执行决策对象，存在歧义',
        mode: 'full',
        html: '',
        patches: [],
      },
    };
  }
  if (selectedJson.noUniqueDecisionCandidate) {
    return {
      ok: false,
      error: '模型输出包含多个 JSON 候选但没有唯一合法 JSON 决策候选（待修复 bug），已阻止落地。',
      decision: {
        shouldUpdate: false,
        action: 'stay',
        nodeId: currentNode.nodeId,
        parentId: null,
        title: currentNode.title,
        intent: '(解析失败)',
        reasoning: '模型返回的多个 JSON 候选无法可靠选择',
        mode: 'full',
        html: '',
        patches: [],
      },
    };
  }
  if (selectedJson.noValidMixedDecisionCandidate) {
    return {
      ok: false,
      error: '模型输出混入非 JSON 内容但没有合法 JSON 决策候选（待修复 bug），已阻止落地。',
      decision: {
        shouldUpdate: false,
        action: 'stay',
        nodeId: currentNode.nodeId,
        parentId: null,
        title: currentNode.title,
        intent: '(解析失败)',
        reasoning: '模型返回的混合内容没有合法决策对象',
        mode: 'full',
        html: '',
        patches: [],
      },
    };
  }

  let obj;
  const duplicateKeys = findDuplicateTopLevelKeys(jsonText);
  if (duplicateKeys.length) {
    return {
      ok: false,
      error: `模型输出包含重复关键字段（待修复 bug）：${duplicateKeys.join(', ')}`,
      decision: {
        shouldUpdate: false,
        action: 'stay',
        nodeId: currentNode.nodeId,
        parentId: null,
        title: currentNode.title,
        intent: '(解析失败)',
        reasoning: '模型返回的决策 JSON 含重复关键字段',
        mode: 'full',
        html: '',
        patches: [],
      },
    };
  }
  try {
    obj = JSON.parse(jsonText);
  } catch (err) {
    // 尝试修复截断的 JSON（常见原因：html 太长超出 token 限制）
    let repaired = null;
    if (err.message.includes('Unterminated string') || err.message.includes('Unexpected end')) {
      // 策略：在末尾补全可能缺少的闭合符号，逐步尝试
      const suffixes = ['"}', ']}', '}}', '"]}', '"}}'];
      for (const suffix of suffixes) {
        try {
          repaired = JSON.parse(jsonText + suffix);
          console.warn('[parseHybridOutput] JSON 截断已修复，补全后缀:', suffix);
          break;
        } catch {
          // 继续尝试下一个后缀
        }
      }
    }
    if (repaired) {
      obj = repaired;
      truncatedRepair = true;
    } else {
      return {
        ok: false,
        error: `模型输出非合法 JSON（待修复 bug）: ${err.message}`,
        decision: {
          shouldUpdate: false,
          action: 'stay',
          nodeId: currentNode.nodeId,
          parentId: null,
          title: currentNode.title,
          intent: '(解析失败)',
          reasoning: '模型返回的内容无法解析为 JSON',
          mode: 'full',
          html: '',
          patches: [],
        },
      };
    }
  }

  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return {
      ok: false,
      error: '模型输出 JSON 顶层非对象（待修复 bug）：必须返回单个决策对象。',
      decision: {
        shouldUpdate: false,
        action: 'stay',
        nodeId: currentNode.nodeId,
        parentId: null,
        title: currentNode.title,
        intent: '(解析失败)',
        reasoning: '模型返回的 JSON 顶层不是决策对象',
        mode: 'full',
        html: '',
        patches: [],
      },
    };
  }
  if (obj.decision && typeof obj.decision === 'object') {
    return {
      ok: false,
      error: '模型输出包含嵌套决策对象（待修复 bug）：必须返回顶层决策字段，不接受 decision 包裹。',
      decision: {
        shouldUpdate: false,
        action: 'stay',
        nodeId: currentNode.nodeId,
        parentId: null,
        title: currentNode.title,
        intent: '(解析失败)',
        reasoning: '模型返回了嵌套 decision 对象',
        mode: 'full',
        html: '',
        patches: [],
      },
    };
  }

  // === 鲁棒性：修复模型偶发损坏的字段名 ===
  const repairResult = fuzzyRepairKeys(obj);
  let { fixed, dirty } = repairResult;
  if (dirty) {
    console.warn('[parseHybridOutput] 模型输出字段名损坏，已模糊修复。原始keys:', Object.keys(obj));
  }
  obj = fixed;

  // === 鲁棒性：修复模型值错位 bug（如 html 被放到 nodeId 中）===
  function looksLikeHtml(v) {
    return typeof v === 'string' && (v.trim().startsWith('<') || v.trim().startsWith('<!'));
  }
  function looksLikeNodeId(v) {
    return typeof v === 'string' && /^[a-zA-Z0-9_\-]+$/.test(v) && v.length < 80;
  }
  function sanitizeNodeId(v) {
    if (typeof v !== 'string') return null;
    const cleaned = v
      .trim()
      .toLowerCase()
      .replace(/[{}]/g, '')
      .replace(/-/g, '_')
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');
    if (!cleaned || RESERVED_ACTION_VALUES.has(cleaned)) return null;
    return cleaned;
  }
  function inferNodeIdFromHtml(html) {
    if (!looksLikeHtml(html)) return null;
    const idMatch = html.match(/\sid="([a-zA-Z][a-zA-Z0-9_-]{2,})"/);
    if (idMatch) return sanitizeNodeId(idMatch[1]);
    const classMatch = html.match(/\sclass="([a-zA-Z][a-zA-Z0-9_-]{2,})/);
    if (classMatch) return sanitizeNodeId(classMatch[1]);
    return null;
  }
  function inferNodeIdFromText(text) {
    if (!text) return null;
    const compact = String(text).trim().toLowerCase();
    const sanitizedCompact = sanitizeNodeId(compact);
    if (sanitizedCompact && looksLikeNodeId(sanitizedCompact)) return sanitizedCompact;
    const map = [
      ['广州', 'guangzhou'],
      ['北京', 'beijing'],
      ['上海', 'shanghai'],
      ['深圳', 'shenzhen'],
      ['旅游地图', 'travel_map'],
      ['地图', 'map'],
      ['广州塔', 'canton_tower'],
      ['东京', 'tokyo'],
      ['地球', 'earth'],
      ['空间站', 'space_station'],
      ['宇航员', 'astronaut'],
      ['地出', 'earthrise'],
      ['沉浸', 'immersive'],
      ['卡片', 'card'],
      ['航线', 'routes'],
      ['可视化', 'visualization'],
      ['展示', 'showcase'],
    ];
    const tokens = map.filter(([cn]) => compact.includes(cn)).map(([, en]) => en);
    if (tokens.length) return [...new Set(tokens)].join('_');
    const englishTokens = compact.match(/[a-z][a-z0-9_-]{2,}/g) || [];
    const filtered = englishTokens
      .map((token) => sanitizeNodeId(token))
      .filter((token) => token && !RESERVED_ACTION_VALUES.has(token))
      .filter((token, index, arr) => arr.indexOf(token) === index)
      .slice(0, 4);
    return filtered.length ? filtered.join('_') : null;
  }
  function invalidDecision(reason) {
    return {
      ok: false,
      error: `模型输出决策字段异常（待修复 bug）：${reason}`,
      decision: {
        shouldUpdate: false,
        action: 'stay',
        nodeId: currentNode.nodeId,
        parentId: null,
        title: currentNode.title,
        intent: '(解析失败)',
        reasoning: '模型返回的决策字段缺失或类型不合法',
        mode: 'full',
        html: '',
        patches: [],
      },
    };
  }
  // nodeId 不该是 HTML
  if (typeof obj.nodeId === 'string' && obj.nodeId.length > 200 && looksLikeHtml(obj.nodeId)) {
    dirty = true;
    // 把 nodeId 的 HTML 内容移到 html
    if (!obj.html || obj.html.length < obj.nodeId.length) {
      obj.html = obj.nodeId;
    }
    // 尝试从 title 或 intent 推断 nodeId
    obj.nodeId = inferNodeIdFromText(obj.title) || inferNodeIdFromText(obj.intent) || undefined;
  }
  // html 不该是短标识符
  if (typeof obj.html === 'string' && obj.html.length < 200 && !looksLikeHtml(obj.html) && looksLikeNodeId(obj.html)) {
    dirty = true;
    if (!obj.nodeId) obj.nodeId = obj.html;
    obj.html = '';
  }

  // 清理模型偶发追加到字段值末尾的结构残片（如 "tiananmen{"）。
  for (const key of ['action', 'nodeId', 'parentId', 'title', 'intent', 'reasoning']) {
    if (typeof obj[key] === 'string' && /[{\s]+$/.test(obj[key])) {
      dirty = true;
      obj[key] = obj[key].replace(/[{\s]+$/g, '');
    }
  }

  if (typeof obj.shouldUpdate !== 'boolean') {
    return invalidDecision('缺少 shouldUpdate 或 shouldUpdate 不是 boolean。');
  }
  if (!['stay', 'navigate', 'create'].includes(obj.action)) {
    return invalidDecision('action 缺失或不在 stay/navigate/create 枚举内。');
  }
  if (!['full', 'patch'].includes(obj.mode)) {
    return invalidDecision('mode 缺失或不在 full/patch 枚举内。');
  }
  if ('nodeId' in obj && typeof obj.nodeId !== 'string') {
    return invalidDecision('nodeId 必须是字符串。');
  }
  if ('parentId' in obj && obj.parentId !== null && typeof obj.parentId !== 'string') {
    return invalidDecision('parentId 必须是字符串或 null。');
  }
  if ('title' in obj && typeof obj.title !== 'string') {
    return invalidDecision('title 必须是字符串。');
  }
  if ('intent' in obj && typeof obj.intent !== 'string') {
    return invalidDecision('intent 必须是字符串。');
  }
  if ('reasoning' in obj && typeof obj.reasoning !== 'string') {
    return invalidDecision('reasoning 必须是字符串。');
  }
  if ('html' in obj && typeof obj.html !== 'string') {
    return invalidDecision('html 必须是字符串。');
  }
  if ('variantId' in obj && obj.variantId !== null && typeof obj.variantId !== 'string') {
    return invalidDecision('variantId 必须是字符串或 null。');
  }
  if (obj.mode === 'patch' && !Array.isArray(obj.patches)) {
    return invalidDecision('mode=patch 时 patches 必须是数组。');
  }

  let recovered = dirty;
  // nodeId 不应落到动作保留字上，优先从 html / title / intent 中恢复。
  if (typeof obj.nodeId === 'string' && RESERVED_ACTION_VALUES.has(obj.nodeId)) {
    recovered = true;
    obj.nodeId =
      inferNodeIdFromHtml(obj.html) ||
      inferNodeIdFromText(obj.title) ||
      inferNodeIdFromText(obj.intent) ||
      `${currentNode.nodeId}_generated`;
  }

  // 动作一致性校验：进入当前页下的新 nodeId 时，应视为 create，而不是 stay。
  if (obj.action === 'stay' && obj.nodeId && obj.nodeId !== currentNode.nodeId) {
    recovered = true;
    obj.action = obj.parentId === currentNode.nodeId ? 'create' : 'navigate';
  }
  if (typeof obj.nodeId === 'string') {
    const sanitized = sanitizeNodeId(obj.nodeId);
    if (sanitized && sanitized !== obj.nodeId) {
      recovered = true;
      obj.nodeId = sanitized;
    }
  }

  // 字段规整与基本校验
  const decision = {
    shouldUpdate: Boolean(obj.shouldUpdate),
    action: ['stay', 'navigate', 'create'].includes(obj.action) ? obj.action : 'stay',
    nodeId: typeof obj.nodeId === 'string' && obj.nodeId ? obj.nodeId : currentNode.nodeId,
    parentId: typeof obj.parentId === 'string' ? obj.parentId : null,
    title: typeof obj.title === 'string' && obj.title ? obj.title : currentNode.title,
    intent: String(obj.intent || ''),
    reasoning: String(obj.reasoning || ''),
    mode: obj.mode === 'patch' ? 'patch' : 'full',
    html: typeof obj.html === 'string' ? obj.html : '',
    patches: Array.isArray(obj.patches) ? obj.patches : [],
    variantId: typeof obj.variantId === 'string' && obj.variantId ? obj.variantId : null,
  };

  const result = { ok: true, decision };
  if (truncatedRepair) {
    // 截断修复的内容本质不完整（HTML 很可能被半路截断），不可信。
    // 显式判失败并阻止落地：强制 shouldUpdate=false，让上层走 no-update 分支，不提交残缺页面。
    decision.shouldUpdate = false;
    result.ok = false;
    result.error = '模型输出被截断（疑似超出 token 限制），已阻止落地以免提交残缺页面。此问题需关注（待修复 bug）。';
    return result;
  }
  if (recovered) {
    result.error = '警告：模型输出存在字段名损坏 bug，已自动修复。此问题需关注。';
    result.ok = false;
  }
  if (mixedContent || multipleCandidates) {
    const reason = multipleCandidates
      ? '模型输出混入多个 JSON 候选，已选择第一个合法决策对象。'
      : '模型输出混入非 JSON 内容，已提取合法决策对象。';
    result.error = result.error ? `${result.error} ${reason}` : `警告：${reason}`;
    result.ok = false;
  }
  return result;
}
