// 意图编排：把交互事件 + 上下文组装为多模态 messages，并解析模型的混合输出
import { SYSTEM_PROMPT } from './prompt.js';
import { buildPresetContextText } from './presets.js';

// 控制回传给模型的当前页 HTML 长度，避免上下文超限
const MAX_HTML_CHARS = 6000;

function truncateHtml(html) {
  if (!html) return '(空白欢迎页，尚无内容)';
  if (html.length <= MAX_HTML_CHARS) return html;
  return html.slice(0, MAX_HTML_CHARS) + `\n...(已截断，原长 ${html.length} 字符)`;
}

/**
 * 组装发送给 step-3.5-flash 的多模态 messages。
 * @param {object} interaction - 前端归一化的交互事件
 *   { type, text, gesture, point, selection, audio:{dataUrl,format}, image:{dataUrl} }
 * @param {object} currentNode - { nodeId, title, html }
 * @param {Array} graphSummary - [{ nodeId, title, parentId }]
 */
export function buildMessages(interaction, currentNode, graphSummary) {
  const presetContext = buildPresetContextText(interaction);
  const contextText = [
    `【当前节点】nodeId=${currentNode.nodeId} title=${currentNode.title}`,
    `【当前页面 HTML】\n${truncateHtml(currentNode.html)}`,
    `【已存在节点列表（可作为 navigate 目标）】\n${JSON.stringify(graphSummary, null, 0)}`,
    presetContext,
    `【本次交互】\n${describeInteraction(interaction)}`,
  ].join('\n\n');

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
  'intent', 'reasoning', 'mode', 'html', 'patches',
];
const RESERVED_ACTION_VALUES = new Set(['stay', 'navigate', 'create']);

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
  let jsonText = raw.trim();
  // 容错：去掉可能的 ```json ``` 包裹
  const fenceMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) jsonText = fenceMatch[1].trim();

  let obj;
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

  // 兜底：如果 shouldUpdate/action 仍缺失，从内容推断
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
  if (obj.shouldUpdate === undefined) {
    recovered = true;
    const hasContent = (typeof obj.html === 'string' && obj.html.trim().length > 0) ||
                      (obj.parentId !== undefined && obj.parentId !== null) ||
                      (Array.isArray(obj.patches) && obj.patches.length > 0);
    obj.shouldUpdate = hasContent;
  }
  if (obj.action === undefined) {
    recovered = true;
    if (obj.parentId && obj.parentId !== currentNode.nodeId) {
      obj.action = 'create';
    } else if (obj.nodeId && obj.nodeId !== currentNode.nodeId) {
      obj.action = 'navigate';
    } else {
      obj.action = 'stay';
    }
  }

  // 清理模型偶发追加到字段值末尾的结构残片（如 "tiananmen{"）。
  for (const key of ['action', 'nodeId', 'parentId', 'title', 'intent', 'reasoning']) {
    if (typeof obj[key] === 'string' && /[{\s]+$/.test(obj[key])) {
      recovered = true;
      obj[key] = obj[key].replace(/[{\s]+$/g, '');
    }
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
  };

  const result = { ok: true, decision };
  if (recovered) {
    result.error = '警告：模型输出存在字段名损坏 bug，已自动修复。此问题需关注。';
    result.ok = false;
  }
  return result;
}
