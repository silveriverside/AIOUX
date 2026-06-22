// main.js — 应用编排：交互事件 → 后端 → 按 action/mode 渲染 → 刷新图谱/状态
import { api } from './api.js';
import * as stage from './stage.js';
import { initGraphPanel, renderBreadcrumb, renderTree, renderVersions } from './graph.js';
import { initInteractions } from './interactions/index.js';
import { routeInteraction } from './route-interaction.js';
import { createTracePanelState, recordTraceEvent, renderTracePanel } from './trace-panel.js';

const els = {
  welcome: document.getElementById('welcome'),
  loading: document.getElementById('loading'),
  statusAction: document.getElementById('status-action'),
  statusText: document.getElementById('status-text'),
  promptInput: document.getElementById('prompt-input'),
  promptSend: document.getElementById('prompt-send'),
  tracePanel: document.getElementById('trace-panel'),
};

let currentNodeId = 'main';
let busy = false;
const tracePanelState = createTracePanelState({ limit: 12 });

function makeTraceId(prefix = 'client') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function elapsedSince(start) {
  return Math.round(performance.now() - start);
}

function logTiming(event, detail) {
  console.info('[timing]', JSON.stringify({ event, ...detail }));
  recordTraceEvent(tracePanelState, event, detail);
  renderTracePanel(els.tracePanel, tracePanelState.entries);
}

function setStatus(text, action) {
  els.statusText.textContent = text;
  if (action) {
    els.statusAction.textContent = action;
    els.statusAction.className = 'badge ' + (['create', 'navigate', 'error'].includes(action) ? action : '');
  }
}
function setLoading(on) { els.loading.classList.toggle('hidden', !on); }
function hideWelcome() { els.welcome.classList.add('hidden'); }

// 处理一次交互事件
async function handleInteraction(ev) {
  const traceId = ev.traceId || makeTraceId('interaction');
  const clientStart = performance.now();
  const routed = routeInteraction(ev, stage.getCapabilities());
  const routeMs = elapsedSince(clientStart);
  if (routed.kind === 'local_native') {
    const clientMs = elapsedSince(clientStart);
    logTiming('local_interaction', {
      traceId,
      type: ev.type,
      intentHint: routed.intentHint,
      sceneType: stage.getCapabilities().sceneType,
      timing: { routeMs, totalMs: clientMs },
    });
    setStatus(`${routed.message} · 本地耗时 ${clientMs}ms`, '提示');
    return;
  }
  if (busy) { setStatus('上一次仍在处理中，已忽略本次交互', 'error'); return; }
  // 附带当前页 HTML 供后端上下文（后端也存有，这里前端不强依赖）
  const payload = {
    ...ev,
    traceId,
    intentHint: routed.intentHint,
    currentCapabilities: stage.getCapabilities(),
  };
  busy = true; setLoading(true);
  setStatus(`处理交互: ${ev.type}…`, '处理中');
  try {
    const apiStart = performance.now();
    const res = await api.interact(payload);
    const apiRoundTripMs = elapsedSince(apiStart);
    const clientMs = elapsedSince(clientStart);
    const clientTiming = { routeMs, apiRoundTripMs, totalMs: clientMs };
    logTiming('remote_interaction', {
      traceId,
      type: ev.type,
      intentHint: routed.intentHint,
      sceneType: payload.currentCapabilities.sceneType,
      clientTiming,
      serverTiming: res.timing || null,
    });
    applyResult(res, clientTiming, traceId);
  } catch (err) {
    const clientMs = elapsedSince(clientStart);
    logTiming('remote_interaction_failed', {
      traceId,
      type: ev.type,
      intentHint: routed.intentHint,
      timing: { routeMs, totalMs: clientMs },
      error: err.message,
    });
    setStatus(`交互失败: ${err.message}`, 'error');
  } finally {
    busy = false; setLoading(false);
  }
}

function applyResult(res, clientTiming = null, fallbackTraceId = '') {
  const d = res.decision || {};
  const traceId = res.traceId || fallbackTraceId || makeTraceId('result');
  const timingText = formatTiming(res.timing, clientTiming?.totalMs);
  const snapshotText = res.snapshot?.mode === 'async' ? ' · 快照后台保存中' : '';
  const badge = d.action === 'create' ? 'create' : d.action === 'navigate' ? 'navigate' : '更新';
  if (!res.applied) {
    logTiming('apply_result_skip', { traceId, action: d.action, mode: d.mode, clientTiming, serverTiming: res.timing || null });
    setStatus(`未更新 · ${d.reasoning || d.intent || '模型判断无需改变界面'}${timingText}`, '无更新');
    return;
  }
  hideWelcome();

  if (d.action === 'navigate') {
    const renderStart = performance.now();
    stage.renderFull(res.html || '');
    logTiming('render_full', { traceId, action: d.action, mode: d.mode, timing: { renderMs: elapsedSince(renderStart) } });
  } else if (d.mode === 'patch' && d.action === 'stay') {
    const patchStart = performance.now();
    const patchResult = stage.applyPatchesSafely(d.patches);
    logTiming('patch_apply', {
      traceId,
      action: d.action,
      mode: d.mode,
      timing: { patchClientMs: elapsedSince(patchStart), ...(patchResult.timing || {}) },
      assessment: patchResult.assessment || null,
      ok: patchResult.ok,
      error: patchResult.error || null,
    });
    if (!patchResult.ok) {
      setStatus(`patch 应用失败，已回滚: ${patchResult.error}${timingText}`, 'error');
      return;
    }
    // 增量渲染后，把最终 HTML 同步回后端持久化为版本
    syncFinalHtml(res.nodeId, patchResult.html, traceId)
      .then((syncRes) => {
        logTiming('sync_complete', { traceId: syncRes.traceId || traceId, nodeId: res.nodeId, timing: syncRes.clientTiming, serverTiming: syncRes.timing || null });
        if (syncRes.snapshot?.jobId) {
          setStatus(`${labelOf(d.action)} · ${d.intent || ''}（${d.reasoning || ''}）${timingText} · 快照后台保存中`, badge);
          watchSnapshotJob(syncRes.snapshot.jobId, badge, timingText);
        }
      })
      .catch((e) => {
        console.warn('sync 失败:', e.message);
        setStatus(`patch 同步失败: ${e.message}${timingText}`, 'error');
      });
  } else {
    const renderStart = performance.now();
    stage.renderFull(res.html || '');
    logTiming('render_full', { traceId, action: d.action, mode: d.mode, timing: { renderMs: elapsedSince(renderStart) } });
  }

  currentNodeId = res.nodeId || d.nodeId || currentNodeId;
  setStatus(`${labelOf(d.action)} · ${d.intent || ''}（${d.reasoning || ''}）${timingText}${snapshotText}`, badge);
  if (res.snapshot?.jobId) {
    watchSnapshotJob(res.snapshot.jobId, badge, timingText);
  }

  if (res.graph) renderTree(res.graph);
  if (res.breadcrumb) renderBreadcrumb(res.breadcrumb);
  renderVersions(currentNodeId);
}

async function syncFinalHtml(nodeId, html, traceId) {
  const syncStart = performance.now();
  const resp = await fetch('/api/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nodeId, html, traceId }),
  });
  const data = await resp.json().catch(() => ({}));
  const clientTiming = { syncRoundTripMs: elapsedSince(syncStart) };
  if (!resp.ok) throw new Error(data.error || `请求失败 ${resp.status}`);
  return { ...data, clientTiming };
}

function labelOf(action) {
  return { create: '新建子页', navigate: '跳转节点', stay: '更新当前页' }[action] || '更新';
}

function formatTiming(serverTiming, clientMs) {
  const pieces = [];
  if (typeof clientMs === 'number') pieces.push(`端到端 ${clientMs}ms`);
  if (serverTiming?.totalMs) pieces.push(`服务端 ${serverTiming.totalMs}ms`);
  if (serverTiming?.modelMs) pieces.push(`模型 ${serverTiming.modelMs}ms`);
  return pieces.length ? ` · 耗时：${pieces.join(' / ')}` : '';
}

function watchSnapshotJob(jobId, badge, timingText) {
  const maxAttempts = 40;
  let attempts = 0;
  const poll = async () => {
    attempts += 1;
    try {
      const resp = await fetch(`/api/snapshot-jobs/${encodeURIComponent(jobId)}`);
      const job = await resp.json();
      if (!resp.ok) throw new Error(job.error || `快照任务查询失败 ${resp.status}`);
      if (job.status === 'done') {
        setStatus(`快照已保存 · ${job.elapsedMs}ms · ${job.commit?.slice(0, 8) || 'no-hash'}${timingText}`, badge);
        renderVersions(currentNodeId);
        return;
      }
      if (job.status === 'failed') {
        setStatus(`快照保存失败 · ${job.error || '未知错误'}${timingText}`, 'error');
        return;
      }
      if (attempts < maxAttempts) setTimeout(poll, 1000);
      else setStatus(`快照仍在后台保存中 · job=${jobId}${timingText}`, badge);
    } catch (err) {
      setStatus(`快照状态查询失败: ${err.message}${timingText}`, 'error');
    }
  };
  setTimeout(poll, 1000);
}

// 手动导航（点面包屑/节点树）
async function navigateTo(nodeId) {
  if (busy) return;
  busy = true; setLoading(true);
  try {
    const res = await api.navigate(nodeId);
    hideWelcome();
    stage.renderFull(res.html || '');
    currentNodeId = nodeId;
    renderBreadcrumb(res.breadcrumb);
    renderTree(res.graph);
    renderVersions(nodeId);
    setStatus(`已跳转到节点: ${nodeId}`, 'navigate');
  } catch (err) {
    setStatus(`跳转失败: ${err.message}`, 'error');
  } finally { busy = false; setLoading(false); }
}

// 版本回退
async function revertTo(nodeId, fullHash) {
  if (busy) return;
  busy = true; setLoading(true);
  try {
    const res = await api.revert(nodeId, fullHash);
    hideWelcome();
    stage.renderFull(res.html || '');
    currentNodeId = nodeId;
    renderBreadcrumb(res.breadcrumb);
    renderVersions(nodeId);
    setStatus(`已回退节点 ${nodeId} 到 ${fullHash.slice(0, 8)}`, 'navigate');
  } catch (err) {
    setStatus(`回退失败: ${err.message}`, 'error');
  } finally { busy = false; setLoading(false); }
}

// ===== 初始化 =====
async function boot() {
  initGraphPanel({ onNavigate: navigateTo, onRevert: revertTo });
  renderTracePanel(els.tracePanel, tracePanelState.entries);

  // 检查 API key 配置
  try {
    const s = await api.status();
    if (!s.hasApiKey) setStatus('未配置 STEPFUN_API_KEY，请在 .env 填写后重启服务', 'error');
  } catch {}

  // 加载已有图谱（若之前已生成过内容）
  try {
    const g = await api.graph();
    renderTree(g.graph);
    renderBreadcrumb(g.breadcrumb);
    currentNodeId = g.graph.current;
    if (g.currentHtml) { hideWelcome(); stage.renderFull(g.currentHtml); }
    renderVersions(currentNodeId);
  } catch (e) { console.warn('加载图谱失败:', e.message); }

  // 初始化交互模块
  const ctl = initInteractions({
    emit: handleInteraction,
    onState: (text, isErr) => setStatus(text, isErr ? 'error' : '提示'),
  });

  // 文本意图
  const sendText = () => {
    const text = els.promptInput.value.trim();
    if (!text) return;
    els.promptInput.value = '';
    handleInteraction({ type: 'text', text });
  };
  els.promptSend.onclick = sendText;
  els.promptInput.onkeydown = (e) => { if (e.key === 'Enter') sendText(); };

  // 模式按钮
  bindMode('mode-voice', () => ctl.voice.toggle(), () => ctl.voice.isRecording());
  bindMode('mode-vision', () => {
    if (ctl.vision.isActive()) ctl.vision.capture(); else ctl.vision.toggle();
  }, () => ctl.vision.isActive());
  bindMode('mode-ar', () => ctl.ar.toggle(), () => ctl.ar.isActive());
  document.getElementById('btn-home').onclick = () => navigateTo('main');
}

function bindMode(id, action, isActive) {
  const btn = document.getElementById(id);
  btn.onclick = async () => {
    await action();
    btn.classList.toggle('active', !!isActive());
  };
}

boot();
