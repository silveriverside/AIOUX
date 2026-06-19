import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getSafeSandboxValue,
  buildPatchedHtml,
  extractBodyHtmlFromDocument,
  renderFull,
  getCurrentHtml,
} from './stage.js';

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
