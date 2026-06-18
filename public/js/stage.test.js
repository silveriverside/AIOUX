import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getSafeSandboxValue,
  buildPatchedHtml,
  extractBodyHtmlFromDocument,
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
