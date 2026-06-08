// Express 路由：交互编排 + 图谱导航 + 版本回退
import express from 'express';
import { performance } from 'node:perf_hooks';
import { chatCompletion } from './stepfun.js';
import { buildMessages, parseHybridOutput } from './intent.js';
import * as graph from './graph.js';
import * as snap from './snapshots.js';
import { HAS_API_KEY } from './config.js';

export const router = express.Router();

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
  const finishTiming = () => {
    timing.totalMs = Math.round(performance.now() - requestStart);
    return timing;
  };
  const logTiming = (decision, applied, extra = '') => {
    console.log(
      `[timing] interact type=${interaction?.type || 'unknown'} action=${decision?.action || 'n/a'} node=${decision?.nodeId || 'n/a'} applied=${applied} total=${timing.totalMs ?? 'n/a'}ms model=${timing.modelMs ?? 0}ms parse=${timing.parseMs ?? 0}ms apply=${timing.applyMs ?? 0}ms ${extra}`.trim()
    );
  };

  if (!interaction) {
    finishTiming();
    console.warn(`[timing] interact bad_request total=${timing.totalMs}ms`);
    return res.status(400).json({ error: '缺少 interaction 字段', timing });
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
  try {
    const messageStart = performance.now();
    const messages = buildMessages(interaction, currentNode, graph.listNodes());
    timing.messageMs = Math.round(performance.now() - messageStart);
    const modelStart = performance.now();
    raw = await chatCompletion(messages, { response_format: { type: 'json_object' } });
    timing.modelMs = Math.round(performance.now() - modelStart);
  } catch (err) {
    // 模型/网络错误：明确上报，不静默降级
    finishTiming();
    console.error('[interact] 模型调用失败:', err.message);
    console.log(`[timing] interact model_error total=${timing.totalMs}ms model=${timing.modelMs ?? 0}ms`);
    return res.status(502).json({ error: err.message, timing });
  }

  const parseStart = performance.now();
  const { ok, error, decision } = parseHybridOutput(raw, currentNode);
  timing.parseMs = Math.round(performance.now() - parseStart);
  if (!ok) console.warn('[interact] 解析降级:', error);

  // 无需更新：直接返回决策，不改图谱不提交
  if (!decision.shouldUpdate) {
    finishTiming();
    logTiming(decision, false, 'skip=no_update');
    return res.json({ decision, error: error || null, applied: false, timing });
  }

  try {
    const applyStart = performance.now();
    const result = await applyDecision(decision, currentNode);
    timing.applyMs = Math.round(performance.now() - applyStart);
    finishTiming();
    logTiming(decision, true, result.snapshot?.mode === 'async' ? 'snapshot=async' : '');
    res.json({
      decision,
      error: error || null,
      applied: true,
      timing,
      ...result,
      graph: graph.getGraph(),
      breadcrumb: graph.getBreadcrumb(graph.getCurrent()),
    });
  } catch (err) {
    finishTiming();
    console.error('[interact] 应用决策失败:', err.message);
    console.log(`[timing] interact apply_error total=${timing.totalMs}ms`);
    res.status(500).json({ error: `应用决策失败: ${err.message}`, decision, timing });
  }
});

// 根据 action 操作图谱与快照
function applyDecision(decision, currentNode) {
  if (decision.action === 'navigate') {
    if (!graph.hasNode(decision.nodeId)) {
      // 目标不存在：降级为提示，不跳转（记录为可改进项）
      console.warn('[navigate] 目标节点不存在:', decision.nodeId);
      return { html: snap.getNodeHtml(currentNode.nodeId), nodeId: currentNode.nodeId, navWarning: '目标节点不存在' };
    }
    graph.setCurrent(decision.nodeId);
    return { html: snap.getNodeHtml(decision.nodeId), nodeId: decision.nodeId };
  }

  if (decision.action === 'create') {
    graph.addNode({
      nodeId: decision.nodeId,
      title: decision.title,
      parentId: decision.parentId || currentNode.nodeId,
      intent: decision.intent,
    });
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

  graph.setCurrent(decision.nodeId);
  if (isPatchStay) {
    return {
      html,
      patches,
      nodeId: decision.nodeId,
      snapshot: { mode: 'deferred-sync', status: 'pending' },
    };
  }

  const message = `[${decision.action}] ${decision.title}: ${decision.intent}`;
  const snapshotJob = snap.commitNodeAsync(decision.nodeId, html, message);
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
router.post('/api/sync', (req, res) => {
  const { nodeId, html } = req.body || {};
  if (!nodeId || typeof html !== 'string') {
    return res.status(400).json({ error: '缺少 nodeId 或 html' });
  }
  if (!graph.hasNode(nodeId)) return res.status(404).json({ error: '节点不存在' });
  try {
    const snapshotJob = snap.commitNodeAsync(nodeId, html, `[sync] ${nodeId}`);
    snapshotJob.promise.catch(() => {
      // 后台队列内部已记录错误；这里避免未处理 Promise 影响进程。
    });
    res.json({
      ok: true,
      snapshot: { mode: 'async', status: 'pending', jobId: snapshotJob.jobId },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
  if (!graph.hasNode(nodeId)) return res.status(404).json({ error: '节点不存在' });
  try {
    const { html } = await snap.revertNode(nodeId, fullHash);
    graph.setCurrent(nodeId);
    res.json({ nodeId, html, breadcrumb: graph.getBreadcrumb(nodeId) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
