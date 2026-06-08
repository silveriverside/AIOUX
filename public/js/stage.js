// sandbox iframe 渲染器：全量渲染 / 增量 patch / 取当前 HTML / 命中元素探测
const iframe = () => document.getElementById('stage');
let currentCapabilities = {
  sceneType: 'generic',
  nativeInteractions: [],
  refinableAspects: [],
  explorableTargets: [],
};

function normalizeCapabilities(raw) {
  return {
    sceneType: raw?.sceneType || 'generic',
    nativeInteractions: Array.isArray(raw?.nativeInteractions) ? raw.nativeInteractions : [],
    refinableAspects: Array.isArray(raw?.refinableAspects) ? raw.refinableAspects : [],
    explorableTargets: Array.isArray(raw?.explorableTargets) ? raw.explorableTargets : [],
  };
}

window.addEventListener('message', (e) => {
  const d = e.data;
  if (!d?.__aioux || d.kind !== 'frame-capabilities') return;
  currentCapabilities = normalizeCapabilities(d.capabilities);
});

const BRIDGE_SCRIPT = `<script>
// 把可探索元素的点击/坐标转发给父窗口，由 pointer 模块统一处理
(function(){
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
      parent.postMessage({ __aioux:true, kind:'frame-capabilities', capabilities: inferCapabilities() }, '*');
    } catch(e) {}
  }
  document.addEventListener('pointerdown', function(e){
    var ex = findExplorable(e.target);
    parent.postMessage({ __aioux:true, kind:'frame-pointer', phase:'down',
      x:e.clientX, y:e.clientY, w:innerWidth, h:innerHeight,
      label: ex ? (ex.dataset.label||ex.textContent.slice(0,40)) : null }, '*');
  }, true);
  document.addEventListener('pointerup', function(e){
    var ex = findExplorable(e.target);
    parent.postMessage({ __aioux:true, kind:'frame-pointer', phase:'up',
      x:e.clientX, y:e.clientY, w:innerWidth, h:innerHeight,
      label: ex ? (ex.dataset.label||ex.textContent.slice(0,40)) : null }, '*');
  }, true);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', reportCapabilities);
  }
  setTimeout(reportCapabilities, 80);
  setTimeout(reportCapabilities, 300);
})();
<\/script>`;

// 包裹模型生成的片段为完整文档，注入基础样式与点击转发脚本
function wrapDocument(fragment) {
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  html,body{margin:0;padding:0;font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;}
  [data-explorable]{cursor:pointer;}
  [data-explorable]:hover{outline:2px solid rgba(94,234,212,.6);outline-offset:2px;}
</style>
${BRIDGE_SCRIPT}</head>
<body>${fragment}</body></html>`;
}

export function renderFull(html) {
  currentCapabilities = normalizeCapabilities(null);
  const doc = iframe().contentDocument;
  doc.open();
  doc.write(wrapDocument(html));
  doc.close();
}

function applyPatchOperations(doc, patches) {
  if (!Array.isArray(patches) || patches.length === 0) {
    throw new Error('patch 列表为空');
  }
  let touched = 0;
  const allowedActions = new Set(['append', 'replace', 'remove']);
  for (const p of patches) {
    if (!p?.selector || typeof p.selector !== 'string') {
      throw new Error('patch 缺少 selector');
    }
    if (!allowedActions.has(p.action)) {
      throw new Error(`不支持的 patch action: ${p.action}`);
    }
    const targets = doc.querySelectorAll(p.selector);
    if (!targets.length) {
      throw new Error(`patch 未命中目标: ${p.selector}`);
    }
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
  const doc = iframe().contentDocument;
  applyPatchOperations(doc, patches);
}

export function applyPatchesSafely(patches) {
  const beforeHtml = getCurrentHtml();
  try {
    const doc = iframe().contentDocument;
    applyPatchOperations(doc, patches);
    const html = validatePatchedDocument(doc, beforeHtml);
    return { ok: true, html };
  } catch (err) {
    renderFull(beforeHtml);
    return { ok: false, error: err.message, html: beforeHtml };
  }
}

// 取当前 iframe body 的 HTML（用于回传后端持久化 / 作为下次上下文）
export function getCurrentHtml() {
  const doc = iframe().contentDocument;
  return doc?.body ? doc.body.innerHTML : '';
}

export function clearStage() {
  const doc = iframe().contentDocument;
  doc.open(); doc.write(''); doc.close();
}

export function getCapabilities() {
  return currentCapabilities;
}
