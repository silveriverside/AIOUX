import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getSafeSandboxValue,
  buildPatchedHtml,
  extractBodyHtmlFromDocument,
  renderFull,
  getCurrentHtml,
  getCurrentBridgeNonce,
  isTrustedFrameMessage,
  buildImportMapScript,
  wrapDocumentForTest,
} from './stage.js';

test('buildImportMapScript 输出 three 与 three/addons 的裸说明符映射', () => {
  const script = buildImportMapScript();
  assert.match(script, /<script type="importmap">/);
  const jsonMatch = script.match(/<script type="importmap">([\s\S]*?)<\/script>/);
  assert.ok(jsonMatch, 'importmap script 应包含 JSON 内容');
  const map = JSON.parse(jsonMatch[1]);
  assert.equal(map.imports.three, 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js');
  assert.equal(map.imports['three/addons/'], 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/');
});

test('wrapDocument 在任何 module 脚本与 body 之前注入 importmap', () => {
  const wrapped = wrapDocumentForTest('<main><canvas id="c"></canvas></main>', 'nonce-importmap');
  const importMapIdx = wrapped.indexOf('type="importmap"');
  const bodyIdx = wrapped.indexOf('<body>');
  const bridgeIdx = wrapped.indexOf('parent.postMessage');
  assert.ok(importMapIdx >= 0, 'wrapDocument 应注入 importmap');
  assert.ok(importMapIdx < bodyIdx, 'importmap 必须在 body 之前');
  assert.ok(importMapIdx < bridgeIdx, 'importmap 必须在 bridge 脚本之前');
  // importmap 必须早于任意 module 类型脚本，否则浏览器忽略它
  const moduleScriptIdx = wrapped.indexOf('type="module"');
  if (moduleScriptIdx >= 0) {
    assert.ok(importMapIdx < moduleScriptIdx, 'importmap 必须在 module 脚本之前');
  }
});

test('默认 iframe sandbox 不包含 allow-same-origin', () => {
  const sandbox = getSafeSandboxValue();
  assert.match(sandbox, /allow-scripts/);
  assert.match(sandbox, /allow-popups/);
  assert.doesNotMatch(sandbox, /allow-same-origin/);
});

test('当输入试图启用危险 sandbox 组合时显式阻止', () => {
  assert.throws(
    () => getSafeSandboxValue('allow-scripts allow-same-origin allow-popups'),
    /allow-same-origin/
  );
});

test('危险 sandbox 组合即使乱序和重复也会被阻止', () => {
  assert.throws(
    () => getSafeSandboxValue('allow-popups allow-same-origin allow-scripts allow-scripts'),
    /allow-scripts \+ allow-same-origin/
  );
});

test('renderFull 只通过 srcdoc 写入隔离 iframe 内容', () => {
  const previousDocument = globalThis.document;
  const frame = {
    attributes: {},
    srcdoc: '',
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    get contentDocument() {
      throw new Error('不应访问 sandbox iframe 的 contentDocument');
    },
  };
  globalThis.document = { getElementById: () => frame };

  try {
    renderFull('<main><h1>安全舞台</h1></main>');
    assert.equal(frame.attributes.sandbox, 'allow-scripts allow-popups');
    assert.match(frame.srcdoc, /<main><h1>安全舞台<\/h1><\/main>/);
    assert.match(frame.srcdoc, /parent\.postMessage/);
  } finally {
    globalThis.document = previousDocument;
  }
});

test('getCurrentHtml 从 srcdoc 提取 body 内容而不读取同源 DOM', () => {
  const previousDocument = globalThis.document;
  const frame = {
    srcdoc: '<!DOCTYPE html><html><body><section id="safe">ok</section></body></html>',
    get contentDocument() {
      throw new Error('不应访问 sandbox iframe 的 contentDocument');
    },
  };
  globalThis.document = { getElementById: () => frame };

  try {
    assert.equal(getCurrentHtml(), '<section id="safe">ok</section>');
  } finally {
    globalThis.document = previousDocument;
  }
});

test('iframe bridge 消息必须同时匹配 source 与 nonce', () => {
  const previousDocument = globalThis.document;
  const contentWindow = {};
  const frame = {
    attributes: {},
    srcdoc: '',
    contentWindow,
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
  };
  globalThis.document = { getElementById: () => frame };

  try {
    renderFull('<main>nonce</main>');
    const nonce = getCurrentBridgeNonce();
    assert.ok(nonce, 'renderFull 应生成 bridge nonce');

    assert.equal(isTrustedFrameMessage({
      source: {},
      data: { __aioux: true, kind: 'frame-capabilities', nonce },
    }, { kind: 'frame-capabilities' }), false);
    assert.equal(isTrustedFrameMessage({
      source: contentWindow,
      data: { __aioux: true, kind: 'frame-capabilities', nonce: 'wrong' },
    }, { kind: 'frame-capabilities' }), false);
    assert.equal(isTrustedFrameMessage({
      source: contentWindow,
      data: { __aioux: true, kind: 'frame-capabilities', nonce, capabilities: {} },
    }, { kind: 'frame-capabilities' }), true);
  } finally {
    globalThis.document = previousDocument;
  }
});

test('iframe bridge 拒绝未知 kind 与畸形 capabilities payload', () => {
  const previousDocument = globalThis.document;
  const contentWindow = {};
  const frame = {
    attributes: {},
    srcdoc: '',
    contentWindow,
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
  };
  globalThis.document = { getElementById: () => frame };

  try {
    renderFull('<main>payload</main>');
    const nonce = getCurrentBridgeNonce();
    assert.equal(isTrustedFrameMessage({
      source: contentWindow,
      data: { __aioux: true, kind: 'frame-debug', nonce },
    }), false);
    assert.equal(isTrustedFrameMessage({
      source: contentWindow,
      data: { __aioux: true, kind: 'frame-capabilities', nonce, capabilities: null },
    }, { kind: 'frame-capabilities' }), false);
    assert.equal(isTrustedFrameMessage({
      source: contentWindow,
      data: { __aioux: true, kind: 'frame-capabilities', nonce, capabilities: { nativeInteractions: 'tap' } },
    }, { kind: 'frame-capabilities' }), false);
    assert.equal(isTrustedFrameMessage({
      source: contentWindow,
      data: { __aioux: true, kind: 'frame-capabilities', nonce, capabilities: { sceneType: 'admin_panel' } },
    }, { kind: 'frame-capabilities' }), false);
    assert.equal(isTrustedFrameMessage({
      source: contentWindow,
      data: { __aioux: true, kind: 'frame-capabilities', nonce, capabilities: { nativeInteractions: [123] } },
    }, { kind: 'frame-capabilities' }), false);
    assert.equal(isTrustedFrameMessage({
      source: contentWindow,
      data: { __aioux: true, kind: 'frame-capabilities', nonce, capabilities: { explorableTargets: Array.from({ length: 33 }, (_, index) => `target-${index}`) } },
    }, { kind: 'frame-capabilities' }), false);
  } finally {
    globalThis.document = previousDocument;
  }
});

test('iframe bridge 接受合法 frame-render-status 并拒绝畸形 payload', () => {
  const previousDocument = globalThis.document;
  const contentWindow = {};
  const frame = {
    attributes: {},
    srcdoc: '',
    contentWindow,
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
  };
  globalThis.document = { getElementById: () => frame };

  try {
    renderFull('<main>render-status</main>');
    const nonce = getCurrentBridgeNonce();
    const base = { __aioux: true, kind: 'frame-render-status', nonce };

    // 合法：ok/hasCanvas 为布尔，sceneType 合法枚举，error 为 null
    assert.equal(isTrustedFrameMessage({
      source: contentWindow,
      data: { ...base, ok: true, hasCanvas: true, sceneType: 'interactive_3d', error: null },
    }, { kind: 'frame-render-status' }), true);
    // 合法：渲染失败带 error 字符串
    assert.equal(isTrustedFrameMessage({
      source: contentWindow,
      data: { ...base, ok: false, hasCanvas: false, sceneType: 'generic', error: 'Failed to resolve module specifier' },
    }, { kind: 'frame-render-status' }), true);
    // 非法：ok 不是布尔
    assert.equal(isTrustedFrameMessage({
      source: contentWindow,
      data: { ...base, ok: 'yes', hasCanvas: true, sceneType: 'generic', error: null },
    }, { kind: 'frame-render-status' }), false);
    // 非法：hasCanvas 不是布尔
    assert.equal(isTrustedFrameMessage({
      source: contentWindow,
      data: { ...base, ok: true, hasCanvas: 1, sceneType: 'generic', error: null },
    }, { kind: 'frame-render-status' }), false);
    // 非法：sceneType 不在枚举
    assert.equal(isTrustedFrameMessage({
      source: contentWindow,
      data: { ...base, ok: true, hasCanvas: true, sceneType: 'admin_panel', error: null },
    }, { kind: 'frame-render-status' }), false);
    // 非法：error 超长
    assert.equal(isTrustedFrameMessage({
      source: contentWindow,
      data: { ...base, ok: false, hasCanvas: false, sceneType: 'generic', error: 'x'.repeat(600) },
    }, { kind: 'frame-render-status' }), false);
    // 非法：error 类型错误
    assert.equal(isTrustedFrameMessage({
      source: contentWindow,
      data: { ...base, ok: false, hasCanvas: false, sceneType: 'generic', error: 123 },
    }, { kind: 'frame-render-status' }), false);
    // 非法：错误 nonce
    assert.equal(isTrustedFrameMessage({
      source: contentWindow,
      data: { ...base, nonce: 'wrong', ok: true, hasCanvas: true, sceneType: 'generic', error: null },
    }, { kind: 'frame-render-status' }), false);
  } finally {
    globalThis.document = previousDocument;
  }
});

test('renderFull 注入的 bridge 脚本包含 frame-render-status 上报', () => {
  const previousDocument = globalThis.document;
  const frame = {
    attributes: {},
    srcdoc: '',
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
  };
  globalThis.document = { getElementById: () => frame };

  try {
    renderFull('<main>render-status-script</main>');
    assert.match(frame.srcdoc, /frame-render-status/);
    assert.match(frame.srcdoc, /querySelector\('canvas'\)/);
  } finally {
    globalThis.document = previousDocument;
  }
});

test('extractBodyHtmlFromDocument 仅返回 body 内部 HTML', () => {
  const html = extractBodyHtmlFromDocument('<!DOCTYPE html><html><body><main><h1>Hello</h1></main></body></html>');
  assert.equal(html, '<main><h1>Hello</h1></main>');
});

test('buildPatchedHtml 基于完整文档字符串应用 append patch', () => {
  const result = buildPatchedHtml('<div id="app"><p>old</p></div>', [
    { selector: '#app', action: 'append', html: '<span>new</span>' },
  ]);
  assert.equal(result.ok, true);
  assert.match(result.html, /<p>old<\/p><span>new<\/span>/);
});
