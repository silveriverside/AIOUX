// sandbox iframe 渲染器：全量渲染 / 增量 patch / 取当前 HTML / 命中元素探测
const iframe = () => document.getElementById('stage');
let currentCapabilities = {
  sceneType: 'generic',
  nativeInteractions: [],
  refinableAspects: [],
  explorableTargets: [],
};
let currentBridgeNonce = null;
const DEFAULT_SANDBOX_TOKENS = ['allow-scripts', 'allow-popups'];
const FORBIDDEN_SANDBOX_COMBINATIONS = [
  ['allow-scripts', 'allow-same-origin'],
];
const ALLOWED_FRAME_MESSAGE_KINDS = new Set(['frame-capabilities', 'frame-pointer']);
const ALLOWED_SCENE_TYPES = new Set(['generic', 'immersive_media', 'card_browser', 'interactive_2d', 'interactive_3d']);
const POINTER_PHASES = new Set(['down', 'up']);
const BRIDGE_ARRAY_LIMIT = 32;
const BRIDGE_TEXT_LIMIT = 80;

function normalizeCapabilities(raw) {
  return {
    sceneType: raw?.sceneType || 'generic',
    nativeInteractions: Array.isArray(raw?.nativeInteractions) ? raw.nativeInteractions : [],
    refinableAspects: Array.isArray(raw?.refinableAspects) ? raw.refinableAspects : [],
    explorableTargets: Array.isArray(raw?.explorableTargets) ? raw.explorableTargets : [],
  };
}

if (typeof window !== 'undefined') {
  window.addEventListener('message', (e) => {
    if (!isTrustedFrameMessage(e, { kind: 'frame-capabilities' })) return;
    const d = e.data;
    currentCapabilities = normalizeCapabilities(d.capabilities);
  });
}

export function createBridgeNonce() {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  if (cryptoApi?.getRandomValues) {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  throw new Error('安全随机数不可用，无法建立 sandbox bridge nonce');
}

export function getCurrentBridgeNonce() {
  return currentBridgeNonce;
}

export function isTrustedFrameMessage(event, { kind = null } = {}) {
  const data = event?.data;
  if (!data?.__aioux) return false;
  if (!ALLOWED_FRAME_MESSAGE_KINDS.has(data.kind)) return false;
  if (kind && data.kind !== kind) return false;
  const frame = iframe();
  if (!frame?.contentWindow) return false;
  if (event.source !== frame.contentWindow) return false;
  if (!currentBridgeNonce || data.nonce !== currentBridgeNonce) return false;
  return validateFrameMessagePayload(data);
}

export function validateFrameMessagePayload(data) {
  if (data?.kind === 'frame-capabilities') {
    const capabilities = data.capabilities;
    if (!capabilities || typeof capabilities !== 'object' || Array.isArray(capabilities)) return false;
    if (capabilities.sceneType !== undefined && !ALLOWED_SCENE_TYPES.has(capabilities.sceneType)) return false;
    for (const field of ['nativeInteractions', 'refinableAspects', 'explorableTargets']) {
      if (capabilities[field] !== undefined && !Array.isArray(capabilities[field])) return false;
      if (Array.isArray(capabilities[field])) {
        if (capabilities[field].length > BRIDGE_ARRAY_LIMIT) return false;
        if (!capabilities[field].every((item) => typeof item === 'string' && item.length <= BRIDGE_TEXT_LIMIT)) return false;
      }
    }
    return true;
  }
  if (data?.kind === 'frame-pointer') {
    if (!POINTER_PHASES.has(data.phase)) return false;
    for (const field of ['x', 'y', 'w', 'h']) {
      if (!Number.isFinite(data[field])) return false;
    }
    if (data.w <= 0 || data.h <= 0) return false;
    if (data.x < 0 || data.x > data.w || data.y < 0 || data.y > data.h) return false;
    if (data.label !== undefined && data.label !== null && (typeof data.label !== 'string' || data.label.length > BRIDGE_TEXT_LIMIT)) return false;
    return true;
  }
  return false;
}

function buildBridgeScript(nonce) {
  return `<script>
// 把可探索元素的点击/坐标转发给父窗口，由 pointer 模块统一处理
(function(){
  var AIOUX_BRIDGE_NONCE = ${JSON.stringify(nonce)};
  function findExplorable(el){ while(el && el!==document.body){ if(el.dataset && el.dataset.explorable) return el; el=el.parentElement; } return null; }
  function inferCapabilities(){
    var declared = window.__AIOUX_CAPABILITIES__ || {};
    var html = document.body ? document.body.innerHTML : '';
    var hasCanvas = !!document.querySelector('canvas');
    var hasSvg = !!document.querySelector('svg');
    var hasCards = document.querySelectorAll('.card,[data-card]').length >= 4;
    var hasPerspective = /perspective|preserve-3d|rotate[XYZ]?/i.test(html);
    var hasDevice = /deviceorientation/i.test(html);
    var hasParallax = /mousemove|parallax/i.test(html);
    var sceneType = declared.sceneType;
    if(!sceneType){
      if ((hasCanvas || hasPerspective) && (hasDevice || hasParallax || /globe|earth|space|3d/i.test(html))) sceneType = 'interactive_3d';
      else if (hasSvg || /tooltip|zoom|pan|route|timeline|map/i.test(html)) sceneType = 'interactive_2d';
      else if (hasCards) sceneType = 'card_browser';
      else if (hasCanvas || /immersive|earthrise|scene|story/i.test(html)) sceneType = 'immersive_media';
      else sceneType = 'generic';
    }
    var defaults = {
      immersive_media: {
        nativeInteractions:['mousemove_parallax','scroll_story','tap_background'],
        refinableAspects:['style','annotations','detail_level','lighting'],
      },
      card_browser: {
        nativeInteractions:['tap_filter','tap_sort','scroll_browse','tap_background'],
        refinableAspects:['categories','sorting','card_density','visual_style'],
      },
      interactive_2d: {
        nativeInteractions:['pan','zoom','swipe','select_rect','select_lasso','tap_background'],
        refinableAspects:['data_overlay','detail_level','focus_region','annotations'],
      },
      interactive_3d: {
        nativeInteractions:['drag_rotate','mousemove_parallax','deviceorientation','tap_background','swipe','pinch'],
        refinableAspects:['style','annotations','detail_level','data_overlay'],
      },
      generic: {
        nativeInteractions:[],
        refinableAspects:['style','layout','detail_level'],
      }
    };
    var fallback = defaults[sceneType] || defaults.generic;
    return {
      sceneType: sceneType,
      nativeInteractions: Array.isArray(declared.nativeInteractions) && declared.nativeInteractions.length ? declared.nativeInteractions : fallback.nativeInteractions,
      refinableAspects: Array.isArray(declared.refinableAspects) && declared.refinableAspects.length ? declared.refinableAspects : fallback.refinableAspects,
      explorableTargets: Array.isArray(declared.explorableTargets) && declared.explorableTargets.length
        ? declared.explorableTargets
        : Array.from(document.querySelectorAll('[data-explorable]')).map(function(el){ return el.dataset.label || el.textContent.slice(0,40); }).filter(Boolean),
    };
  }
  function reportCapabilities(){
    try {
      parent.postMessage({ __aioux:true, kind:'frame-capabilities', nonce:AIOUX_BRIDGE_NONCE, capabilities: inferCapabilities() }, '*');
    } catch(e) {}
  }
  document.addEventListener('pointerdown', function(e){
    if (!e.isTrusted) return;
    var ex = findExplorable(e.target);
    parent.postMessage({ __aioux:true, kind:'frame-pointer', phase:'down',
      x:e.clientX, y:e.clientY, w:innerWidth, h:innerHeight,
      nonce:AIOUX_BRIDGE_NONCE,
      label: ex ? (ex.dataset.label||ex.textContent.slice(0,40)) : null }, '*');
  }, true);
  document.addEventListener('pointerup', function(e){
    if (!e.isTrusted) return;
    var ex = findExplorable(e.target);
    parent.postMessage({ __aioux:true, kind:'frame-pointer', phase:'up',
      x:e.clientX, y:e.clientY, w:innerWidth, h:innerHeight,
      nonce:AIOUX_BRIDGE_NONCE,
      label: ex ? (ex.dataset.label||ex.textContent.slice(0,40)) : null }, '*');
  }, true);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', reportCapabilities);
  }
  setTimeout(reportCapabilities, 80);
  setTimeout(reportCapabilities, 300);
})();
<\/script>`;
}

export function getSafeSandboxValue(input = DEFAULT_SANDBOX_TOKENS.join(' ')) {
  const tokens = String(input)
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
  for (const combo of FORBIDDEN_SANDBOX_COMBINATIONS) {
    if (combo.every((token) => tokens.includes(token))) {
      throw new Error(`危险的 iframe sandbox 权限组合已被阻止: ${combo.join(' + ')}`);
    }
  }
  return [...new Set(tokens)].join(' ');
}

// 包裹模型生成的片段为完整文档，注入基础样式与点击转发脚本
function wrapDocument(fragment, nonce = currentBridgeNonce) {
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  html,body{margin:0;padding:0;font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;}
  [data-explorable]{cursor:pointer;}
  [data-explorable]:hover{outline:2px solid rgba(94,234,212,.6);outline-offset:2px;}
</style>
${buildBridgeScript(nonce)}</head>
<body>${fragment}</body></html>`;
}

function parseDocument(html) {
  if (typeof DOMParser === 'undefined') {
    throw new Error('DOMParser 不可用，无法解析文档');
  }
  return new DOMParser().parseFromString(wrapDocument(html), 'text/html');
}

export function extractBodyHtmlFromDocument(documentHtml) {
  const html = String(documentHtml || '');
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  return bodyMatch ? bodyMatch[1] : html;
}

function applyPatchesWithStringFallback(beforeHtml, patches) {
  let html = String(beforeHtml || '');
  for (const p of patches || []) {
    if (!/^#[a-zA-Z][\w-]*$/.test(p.selector || '')) {
      throw new Error(`当前环境不支持该 patch selector: ${p.selector}`);
    }
    const id = p.selector.slice(1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(<([a-zA-Z][\\w:-]*)([^>]*?)\\sid=["']${id}["'][^>]*>)([\\s\\S]*?)(</\\2>)`, 'i');
    const matched = html.match(pattern);
    if (!matched) throw new Error(`patch 未命中目标: ${p.selector}`);
    if (p.action === 'append') {
      html = html.replace(pattern, `$1$4${p.html || ''}$5`);
    } else if (p.action === 'replace') {
      html = html.replace(pattern, p.html || '');
    } else if (p.action === 'remove') {
      html = html.replace(pattern, '');
    } else {
      throw new Error(`不支持的 patch action: ${p.action}`);
    }
  }
  if (beforeHtml.trim() && !html.trim()) {
    throw new Error('patch 后页面内容为空');
  }
  return html;
}

export function buildPatchedHtml(beforeHtml, patches) {
  try {
    if (typeof DOMParser === 'undefined') {
      return { ok: true, html: applyPatchesWithStringFallback(beforeHtml, patches) };
    }
    const doc = parseDocument(beforeHtml);
    applyPatchOperations(doc, patches);
    const html = validatePatchedDocument(doc, beforeHtml);
    return { ok: true, html };
  } catch (err) {
    return { ok: false, error: err.message, html: beforeHtml };
  }
}

export function renderFull(html) {
  currentCapabilities = normalizeCapabilities(null);
  const frame = iframe();
  if (!frame) return;
  currentBridgeNonce = createBridgeNonce();
  frame.setAttribute('sandbox', getSafeSandboxValue());
  frame.srcdoc = wrapDocument(html, currentBridgeNonce);
}

const ALLOWED_PATCH_ACTIONS = new Set(['append', 'replace', 'remove']);

function analyzePatchRisk(doc, patches, beforeHtml) {
  const reasons = [];
  const bodyChildren = Math.max(doc.body?.children.length || 0, 1);
  let touched = 0;
  let destructiveTouched = 0;
  let injectedHtmlLength = 0;
  let hasClearBodySelector = false;
  let hasLargeReplacement = false;

  for (const p of patches || []) {
    const targets = doc.querySelectorAll(p.selector);
    const targetCount = targets.length;
    touched += targetCount;
    if (p.action === 'remove' || p.action === 'replace') destructiveTouched += targetCount;
    if (typeof p.html === 'string') injectedHtmlLength += p.html.length;

    const selector = p.selector.toLowerCase();
    if (selector === 'html' || selector === 'body') {
      reasons.push(`禁止直接修改根节点: ${p.selector}`);
    }
    if (/(^|[,\s>+~])body\s*>\s*\*/i.test(p.selector) && (p.action === 'remove' || p.action === 'replace')) {
      hasClearBodySelector = true;
      reasons.push(`疑似清空页面主体: ${p.selector}`);
    }
    if (typeof p.html === 'string' && /<script|on\w+\s*=|javascript:/i.test(p.html)) {
      reasons.push('patch HTML 含脚本或事件属性');
    }
    if (p.action === 'replace' && beforeHtml.length > 0 && (p.html || '').length > Math.max(3000, beforeHtml.length * 1.5)) {
      hasLargeReplacement = true;
    }
  }

  const destructiveRatio = destructiveTouched / bodyChildren;
  if (destructiveRatio > 0.6 && (hasClearBodySelector || destructiveTouched > 3)) {
    reasons.push(`破坏性改动范围过大: ${destructiveTouched}/${bodyChildren}`);
  }
  if (hasLargeReplacement || (beforeHtml.length > 0 && injectedHtmlLength > Math.max(8000, beforeHtml.length * 3))) {
    reasons.push('patch 注入内容相对当前页面过大');
  }

  return {
    risk: reasons.length ? 'high' : 'low',
    reasons,
    touched,
    destructiveTouched,
  };
}

function validatePatchShape(doc, patches) {
  if (!Array.isArray(patches) || patches.length === 0) {
    throw new Error('patch 列表为空');
  }
  for (const p of patches) {
    if (!p?.selector || typeof p.selector !== 'string') {
      throw new Error('patch 缺少 selector');
    }
    if (!ALLOWED_PATCH_ACTIONS.has(p.action)) {
      throw new Error(`不支持的 patch action: ${p.action}`);
    }
    const targets = doc.querySelectorAll(p.selector);
    if (!targets.length) {
      throw new Error(`patch 未命中目标: ${p.selector}`);
    }
  }
}

function applyPatchOperations(doc, patches) {
  validatePatchShape(doc, patches);
  let touched = 0;
  for (const p of patches) {
    const targets = doc.querySelectorAll(p.selector);
    touched += targets.length;
    targets.forEach((el) => {
      if (p.action === 'remove') el.remove();
      else if (p.action === 'append') el.insertAdjacentHTML('beforeend', p.html || '');
      else el.outerHTML = p.html || ''; // replace
    });
  }
  if (!touched) throw new Error('patch 未修改任何节点');
}

function validatePatchedDocument(doc, beforeHtml) {
  const afterHtml = doc?.body?.innerHTML || '';
  if (!doc?.body) throw new Error('patch 后文档 body 缺失');
  if (beforeHtml.trim() && !afterHtml.trim()) {
    throw new Error('patch 后页面内容为空');
  }
  return afterHtml;
}

// 对当前 iframe DOM 应用增量补丁
export function applyPatches(patches) {
  const result = buildPatchedHtml(getCurrentHtml(), patches);
  if (!result.ok) throw new Error(result.error);
  renderFull(result.html);
}

export function applyPatchesSafely(patches) {
  const startedAt = performance.now();
  const timing = {};
  const beforeHtml = getCurrentHtml();
  try {
    const doc = parseDocument(beforeHtml);
    const validateStart = performance.now();
    validatePatchShape(doc, patches);
    timing.patchValidateMs = Math.round(performance.now() - validateStart);
    const riskStart = performance.now();
    const assessment = analyzePatchRisk(doc, patches, beforeHtml);
    timing.patchRiskMs = Math.round(performance.now() - riskStart);
    if (assessment.risk === 'high') {
      throw new Error(`patch 风险过高: ${assessment.reasons.join('；')}`);
    }
    const applyStart = performance.now();
    applyPatchOperations(doc, patches);
    timing.patchApplyMs = Math.round(performance.now() - applyStart);
    const documentValidateStart = performance.now();
    const html = validatePatchedDocument(doc, beforeHtml);
    timing.patchDocumentValidateMs = Math.round(performance.now() - documentValidateStart);
    timing.patchTotalMs = Math.round(performance.now() - startedAt);
    return { ok: true, html, assessment, timing };
  } catch (err) {
    const rollbackStart = performance.now();
    renderFull(beforeHtml);
    timing.patchRollbackMs = Math.round(performance.now() - rollbackStart);
    timing.patchTotalMs = Math.round(performance.now() - startedAt);
    return { ok: false, error: err.message, html: beforeHtml, timing };
  }
}

// 取当前 iframe body 的 HTML（用于回传后端持久化 / 作为下次上下文）
export function getCurrentHtml() {
  const frame = iframe();
  return frame ? extractBodyHtmlFromDocument(frame.srcdoc || '') : '';
}

export function clearStage() {
  const frame = iframe();
  if (frame) frame.srcdoc = '';
  currentBridgeNonce = null;
}

export function getCapabilities() {
  return currentCapabilities;
}
