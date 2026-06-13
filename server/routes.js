// Express 路由：交互编排 + 图谱导航 + 版本回退
import express from 'express';
import { performance } from 'node:perf_hooks';
import { chatCompletion } from './stepfun.js';
import { buildMessages, parseHybridOutput } from './intent.js';
import * as graph from './graph.js';
import * as snap from './snapshots.js';
import { resolveAssets } from './assets/index.js';
import { listAssetsByNode, recordAssetUsage, recordInteraction, recordRevert } from './memory.js';
import { HAS_API_KEY } from './config.js';

export const router = express.Router();

function buildAssetRequests(interaction, currentNode, traceId = null) {
  const keywords = [
    interaction?.text,
    interaction?.targetLabel,
    currentNode?.title && currentNode.title !== '主页' ? currentNode.title : '',
  ]
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 3);

  if (!keywords.length) return [];

  const lower = keywords.join(' ').toLowerCase();
  const style = /(真实|写实|照片|摄影|realistic|photo)/.test(lower) ? 'realistic' : undefined;
  return [{
    type: 'image',
    keywords,
    opts: { traceId, ...(style ? { style } : {}) },
  }];
}

function formatAssetContextBlock(assets = []) {
  const list = Array.isArray(assets) ? assets : [];
  if (!list.length) return '';
  const lines = [
    '【可复用素材参考】',
    '以下素材已提前解析，可优先直接引用；若 degraded=true，表示当前仅拿到占位兜底，这是待修复 bug，不是正常成功。',
  ];
  for (const [idx, asset] of list.entries()) {
    lines.push(
      `${idx + 1}. type=${asset?.type || 'unknown'} source=${asset?.source || 'unknown'} degraded=${asset?.degraded === true} fromCache=${asset?.fromCache === true} url=${asset?.url || ''} issueId=${asset?.issueId || 'null'}`
    );
  }
  return lines.join('\n');
}

function formatReusableAssetContextBlock(assets = []) {
  const list = (Array.isArray(assets) ? assets : []).filter((asset) => asset?.url).slice(0, 3);
  if (!list.length) return '';
  const lines = [
    '【历史素材复用参考】',
    '以下素材来自当前节点曾经实际引用过的 HTML，可优先复用以保持视觉连续；若用户要求换风格，以用户诉求为准。',
  ];
  for (const [idx, asset] of list.entries()) {
    lines.push(
      `${idx + 1}. type=${asset?.type || 'unknown'} useCount=${asset?.useCount || 0} url=${asset.url}`
    );
  }
  return lines.join('\n');
}

function appendTextToUserMessage(messages, extraText) {
  if (!extraText) return messages;
  const nextMessages = Array.isArray(messages) ? [...messages] : [];
  const userIndex = nextMessages.findIndex((message) => message?.role === 'user');
  if (userIndex < 0) return messages;

  const userMessage = nextMessages[userIndex];
  const content = Array.isArray(userMessage.content) ? [...userMessage.content] : [];
  const textIndex = content.findIndex((part) => part?.type === 'text' && typeof part.text === 'string');
  if (textIndex < 0) return messages;

  const textPart = content[textIndex];
  content[textIndex] = { ...textPart, text: `${textPart.text}\n\n${extraText}` };
  nextMessages[userIndex] = { ...userMessage, content };
  return nextMessages;
}

function pushHttpAssetUrl(list, seen, url, type = null, order = Number.MAX_SAFE_INTEGER) {
  const clean = String(url || '').trim().replace(/^['"]|['"]$/g, '');
  if (!/^https?:\/\//i.test(clean) || seen.has(clean)) return;
  seen.add(clean);
  list.push({ url: clean, type, order });
}

export function extractAssetReferencesFromHtml(html = '') {
  if (typeof html !== 'string' || !html) return [];
  const assets = [];
  const seen = new Set();
  const attrRe = /\b(src|href|poster|data-src|data-url)\s*=\s*(["'])(.*?)\2/gi;
  let match;
  while ((match = attrRe.exec(html))) {
    pushHttpAssetUrl(assets, seen, match[3], match[1] === 'href' ? 'link' : null, match.index);
  }

  const srcsetRe = /\bsrcset\s*=\s*(["'])(.*?)\1/gi;
  while ((match = srcsetRe.exec(html))) {
    const candidates = match[2].split(',').map((item) => item.trim().split(/\s+/)[0]);
    candidates.forEach((candidate, idx) => pushHttpAssetUrl(assets, seen, candidate, null, match.index + idx / 1000));
  }

  const cssUrlRe = /url\(\s*(["']?)(.*?)\1\s*\)/gi;
  while ((match = cssUrlRe.exec(html))) {
    pushHttpAssetUrl(assets, seen, match[2], null, match.index);
  }
  return assets
    .sort((a, b) => a.order - b.order)
    .map(({ order, ...asset }) => asset);
}

export async function buildMessagesWithAssets({
  interaction,
  currentNode,
  graphSummary,
  observe = null,
  traceId = null,
  resolveAssetsImpl = resolveAssets,
  listReusableAssetsImpl = listAssetsByNode,
  logger = console,
} = {}) {
  const baseMessages = buildMessages(interaction, currentNode, graphSummary, observe);
  let reusableAssets = [];
  try {
    reusableAssets = currentNode?.nodeId ? listReusableAssetsImpl(currentNode.nodeId) : [];
  } catch (err) {
    logger.error('[assets] 历史素材读取失败（需修复的 bug，主流程继续）:', err.message);
    reusableAssets = [];
  }
  const requests = buildAssetRequests(interaction, currentNode, traceId);
  const reusableText = formatReusableAssetContextBlock(reusableAssets);
  if (!requests.length) {
    return {
      messages: appendTextToUserMessage(baseMessages, reusableText),
      assets: [],
      reusedAssets: reusableAssets,
      assetTimingMs: 0,
    };
  }

  const assetStart = performance.now();
  try {
    const assets = await resolveAssetsImpl(requests);
    const assetTimingMs = Math.round((performance.now() - assetStart) * 1000) / 1000;
    const assetText = formatAssetContextBlock(assets);
    const extraText = [reusableText, assetText].filter(Boolean).join('\n\n');
    return {
      messages: appendTextToUserMessage(baseMessages, extraText),
      assets,
      reusedAssets: reusableAssets,
      assetTimingMs,
    };
  } catch (err) {
    const assetTimingMs = Math.round((performance.now() - assetStart) * 1000) / 1000;
    logger.error('[assets] prompt 注入失败（需修复的 bug，主流程继续）:', err.message);
    return {
      messages: appendTextToUserMessage(baseMessages, reusableText),
      assets: [],
      reusedAssets: reusableAssets,
      assetTimingMs,
      assetError: err.message,
    };
  }
}

// 仅在真正成功应用后把本次交互写入记忆，避免把 no_update / navigate 失败等降级路径污染画像。
export async function maybeRecordInteractionMemory({ interaction, decision, currentNode, result, variant, traceId }) {
  if (!decision || decision.shouldUpdate === false) return false;
  if (result?.applied === false) return false;
  await recordInteraction({ interaction, decision, currentNode, variant, traceId });
  return true;
}

// 仅在真正成功应用后把最终 HTML 实际引用的素材写入记忆索引，失败/不更新路径不污染 assets 画像。
export async function maybeRecordAssetMemory({ decision, result } = {}) {
  if (!decision || decision.shouldUpdate === false) return false;
  if (result?.applied === false) return false;
  const nodeId = result?.nodeId || decision?.nodeId;
  const htmlAssets = extractAssetReferencesFromHtml(result?.html || decision?.html || '');
  if (!nodeId || !htmlAssets.length) return false;
  await recordAssetUsage({ nodeId, assets: htmlAssets });
  return true;
}

// 记录回退负反馈；由调用方决定 nodeId/variantId。
export async function recordRevertMemory({ nodeId, variantId = null, traceId = null } = {}) {
  if (!nodeId) return false;
  await recordRevert({ nodeId, variantId, traceId });
  return true;
}

// 健康/配置状态
router.get('/api/status', (req, res) => {
  res.json({ hasApiKey: HAS_API_KEY });
});

// 返回完整图谱 + 当前节点面包屑
router.get('/api/graph', (req, res) => {
  const current = graph.getCurrent();
  res.json({
    graph: graph.getGraph(),
    breadcrumb: graph.getBreadcrumb(current),
    currentHtml: snap.getNodeHtml(current),
  });
});

// 核心：处理一次交互
router.post('/api/interact', async (req, res) => {
  const requestStart = performance.now();
  const timing = {};
  const { interaction } = req.body || {};
  const traceId = interaction?.traceId || `srv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const finishTiming = () => {
    timing.totalMs = Math.round(performance.now() - requestStart);
    return timing;
  };
  const logTiming = (decision, applied, extra = '') => {
    console.log('[timing]', JSON.stringify({
      event: 'interact',
      traceId,
      type: interaction?.type || 'unknown',
      intentHint: interaction?.intentHint || '',
      sceneType: interaction?.currentCapabilities?.sceneType || 'generic',
      variantId: selectedVariant?.id || 'none',
      variantReason: selectedVariant?.reason || 'none',
      action: decision?.action || 'n/a',
      mode: decision?.mode || 'n/a',
      nodeId: decision?.nodeId || 'n/a',
      applied,
      timing,
      extra,
    }));
  };
  // 本次交互选中的预设变体（可观测），由 buildMessages 通过 observe 回填。
  let selectedVariant = null;

  if (!interaction) {
    finishTiming();
    console.warn('[timing]', JSON.stringify({ event: 'interact_bad_request', traceId, timing }));
    return res.status(400).json({ error: '缺少 interaction 字段', traceId, timing });
  }

  const currentId = graph.getCurrent();
  const contextStart = performance.now();
  const currentNode = {
    nodeId: currentId,
    title: graph.getNode(currentId)?.title || '主页',
    html: snap.getNodeHtml(currentId),
  };
  timing.contextMs = Math.round(performance.now() - contextStart);

  let raw;
  let resolvedAssets = [];
  try {
    const messageStart = performance.now();
    const observe = {};
    const messageBundle = await buildMessagesWithAssets({
      interaction,
      currentNode,
      graphSummary: graph.listNodes(),
      observe,
      traceId,
    });
    const messages = messageBundle.messages;
    resolvedAssets = messageBundle.assets || [];
    selectedVariant = observe.variant || null;
    timing.selectMs = observe.selectMs;
    timing.assetMs = messageBundle.assetTimingMs;
    timing.messageMs = Math.round(performance.now() - messageStart);
    const modelStart = performance.now();
    raw = await chatCompletion(messages, { response_format: { type: 'json_object' } });
    timing.modelMs = Math.round(performance.now() - modelStart);
  } catch (err) {
    // 模型/网络错误：明确上报，不静默降级
    finishTiming();
    console.error('[interact] 模型调用失败:', err.message);
    console.log('[timing]', JSON.stringify({ event: 'interact_model_error', traceId, timing }));
    return res.status(502).json({ error: err.message, traceId, timing });
  }

  const parseStart = performance.now();
  const { ok, error, decision } = parseHybridOutput(raw, currentNode);
  timing.parseMs = Math.round(performance.now() - parseStart);
  if (!ok) console.warn('[interact] 解析降级:', error);

  // 无需更新：直接返回决策，不改图谱不提交
  if (!decision.shouldUpdate) {
    finishTiming();
    logTiming(decision, false, 'skip=no_update');
    return res.json({ traceId, decision, error: error || null, applied: false, variant: selectedVariant, timing });
  }

  try {
    const applyStart = performance.now();
    const result = await applyDecision(decision, currentNode, timing);
    timing.applyMs = Math.round(performance.now() - applyStart);
    try {
      await maybeRecordInteractionMemory({
        interaction,
        decision,
        currentNode,
        result,
        variant: selectedVariant,
        traceId,
      });
    } catch (err) {
      console.error('[memory] interact 写回失败（需修复的 bug，主流程继续）:', err.message);
    }
    try {
      await maybeRecordAssetMemory({
        decision,
        result,
        assets: resolvedAssets,
      });
    } catch (err) {
      console.error('[memory] asset 写回失败（需修复的 bug，主流程继续）:', err.message);
    }
    finishTiming();
    logTiming(decision, true, result.snapshot?.mode === 'async' ? 'snapshot=async' : '');
    res.json({
      decision,
      error: error || null,
      applied: true,
      traceId,
      variant: selectedVariant,
      timing,
      ...result,
      graph: graph.getGraph(),
      breadcrumb: graph.getBreadcrumb(graph.getCurrent()),
    });
  } catch (err) {
    finishTiming();
    console.error('[interact] 应用决策失败:', err.message);
    console.log('[timing]', JSON.stringify({ event: 'interact_apply_error', traceId, timing }));
    res.status(500).json({ error: `应用决策失败: ${err.message}`, traceId, decision, timing });
  }
});

// 根据 action 操作图谱与快照
export function applyDecision(decision, currentNode, timing = {}) {
  if (decision.action === 'navigate') {
    const navStart = performance.now();
    if (!graph.hasNode(decision.nodeId)) {
      // 目标不存在：不跳转，明确标记为未应用（不把失败伪装成 applied:true）。
      console.warn('[navigate] 目标节点不存在:', decision.nodeId);
      timing.graphMs = Math.round(performance.now() - navStart);
      return {
        html: snap.getNodeHtml(currentNode.nodeId),
        nodeId: currentNode.nodeId,
        applied: false,
        navWarning: `目标节点不存在: ${decision.nodeId}`,
      };
    }
    graph.setCurrent(decision.nodeId);
    timing.graphMs = Math.round(performance.now() - navStart);
    return { html: snap.getNodeHtml(decision.nodeId), nodeId: decision.nodeId };
  }

  if (decision.action === 'create') {
    const graphStart = performance.now();
    // 防止 create 命中已存在 nodeId 时静默覆盖既有页面：存在则生成去重后缀的新 nodeId。
    if (graph.hasNode(decision.nodeId)) {
      const baseId = decision.nodeId;
      let suffix = 2;
      while (graph.hasNode(`${baseId}_${suffix}`)) suffix += 1;
      const dedupedId = `${baseId}_${suffix}`;
      console.warn(`[create] nodeId 冲突，已去重: ${baseId} -> ${dedupedId}`);
      decision.nodeId = dedupedId;
    }
    graph.addNode({
      nodeId: decision.nodeId,
      title: decision.title,
      parentId: decision.parentId || currentNode.nodeId,
      intent: decision.intent,
    });
    timing.graphMs = Math.round(performance.now() - graphStart);
  }

  // create 或 stay 都需要落地 HTML 内容
  let html = decision.html;
  let patches = null;
  const isPatchStay = decision.mode === 'patch' && decision.action === 'stay';
  if (isPatchStay) {
    // 增量模式：HTML 在前端应用，后端用前端回传的最终 HTML 提交（此处先存当前+标记）
    patches = decision.patches;
    // 仍以模型给的 html 为空时，保留旧内容；提交交由前端二次 sync（见 /api/sync）
    html = decision.html || snap.getNodeHtml(decision.nodeId);
  }

  const currentStart = performance.now();
  graph.setCurrent(decision.nodeId);
  timing.graphMs = (timing.graphMs || 0) + Math.round(performance.now() - currentStart);
  if (isPatchStay) {
    return {
      html,
      patches,
      nodeId: decision.nodeId,
      snapshot: { mode: 'deferred-sync', status: 'pending' },
    };
  }

  const message = `[${decision.action}] ${decision.title}: ${decision.intent}`;
  const snapshotStart = performance.now();
  // 入队时刻捕获图谱状态，随快照一起提交，避免队列等待期间被后续交互改写（串版本）。
  const snapshotJob = snap.commitNodeAsync(decision.nodeId, html, message, graph.serialize());
  timing.snapshotEnqueueMs = Math.round(performance.now() - snapshotStart);
  snapshotJob.promise.catch(() => {
    // 后台队列内部已记录错误；这里避免未处理 Promise 影响进程。
  });
  return {
    html,
    patches,
    nodeId: decision.nodeId,
    snapshot: { mode: 'async', status: 'pending', jobId: snapshotJob.jobId },
  };
}

router.get('/api/snapshot-jobs/:jobId', (req, res) => {
  const job = snap.getSnapshotJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: '快照任务不存在' });
  res.json(job);
});

// 前端在增量渲染后回传最终 HTML，持久化为该节点版本
router.post('/api/sync', async (req, res) => {
  const requestStart = performance.now();
  const timing = {};
  const { nodeId, html } = req.body || {};
  const traceId = req.body?.traceId || `sync_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const finishTiming = () => {
    timing.totalMs = Math.round(performance.now() - requestStart);
    return timing;
  };
  if (!nodeId || typeof html !== 'string') {
    finishTiming();
    return res.status(400).json({ error: '缺少 nodeId 或 html', traceId, timing });
  }
  if (!graph.hasNode(nodeId)) {
    finishTiming();
    return res.status(404).json({ error: '节点不存在', traceId, timing });
  }
  try {
    const snapshotStart = performance.now();
    const snapshotJob = snap.commitNodeAsync(nodeId, html, `[sync] ${nodeId}`, graph.serialize());
    timing.snapshotEnqueueMs = Math.round(performance.now() - snapshotStart);
    snapshotJob.promise.catch(() => {
      // 后台队列内部已记录错误；这里避免未处理 Promise 影响进程。
    });
    try {
      await maybeRecordAssetMemory({
        decision: { shouldUpdate: true, nodeId },
        result: { nodeId, html },
      });
    } catch (err) {
      console.error('[memory] sync asset 写回失败（需修复的 bug，主流程继续）:', err.message);
    }
    finishTiming();
    console.log('[timing]', JSON.stringify({ event: 'sync', traceId, nodeId, timing }));
    res.json({
      ok: true,
      traceId,
      timing,
      snapshot: { mode: 'async', status: 'pending', jobId: snapshotJob.jobId },
    });
  } catch (err) {
    finishTiming();
    console.log('[timing]', JSON.stringify({ event: 'sync_error', traceId, nodeId, timing }));
    res.status(500).json({ error: err.message, traceId, timing });
  }
});

// 手动导航到指定节点
router.post('/api/navigate', (req, res) => {
  const { nodeId } = req.body || {};
  if (!graph.hasNode(nodeId)) return res.status(404).json({ error: '节点不存在' });
  graph.setCurrent(nodeId);
  res.json({
    nodeId,
    html: snap.getNodeHtml(nodeId),
    breadcrumb: graph.getBreadcrumb(nodeId),
    graph: graph.getGraph(),
  });
});

// 节点版本历史
router.get('/api/history/:nodeId', async (req, res) => {
  const { nodeId } = req.params;
  if (!graph.hasNode(nodeId)) return res.status(404).json({ error: '节点不存在' });
  const history = await snap.listNodeHistory(nodeId);
  res.json({ nodeId, history });
});

// 回退节点到指定版本
router.post('/api/revert', async (req, res) => {
  const { nodeId, fullHash } = req.body || {};
  const traceId = req.body?.traceId || `revert_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  if (!graph.hasNode(nodeId)) return res.status(404).json({ error: '节点不存在' });
  try {
    const { html } = await snap.revertNode(nodeId, fullHash);
    graph.setCurrent(nodeId);
    try {
      await recordRevertMemory({ nodeId, traceId });
    } catch (err) {
      console.error('[memory] revert 写回失败（需修复的 bug，主流程继续）:', err.message);
    }
    res.json({ nodeId, html, breadcrumb: graph.getBreadcrumb(nodeId) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
