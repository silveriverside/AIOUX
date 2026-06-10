import test from 'node:test';
import assert from 'node:assert/strict';

import { parseHybridOutput } from './intent.js';

const currentNode = {
  nodeId: 'main',
  title: '主页',
  html: '',
};

test('repairs reserved action keyword mistakenly used as nodeId', () => {
  const raw = JSON.stringify({
    shouldUpdate: true,
    action: 'create',
    nodeId: 'create',
    parentId: 'main',
    title: '沉浸式地出视觉场景',
    intent: '生成宇航员从空间站舷窗回望地球的沉浸式视觉场景，以画面为主，支持鼠标视差交互',
    reasoning: '属于沉浸多媒体阅读范式',
    mode: 'full',
    html: '<div id="earthrise-scene"><script>document.addEventListener("mousemove",()=>{})</script></div>',
    patches: [],
  });

  const result = parseHybridOutput(raw, currentNode);

  assert.equal(result.decision.action, 'create');
  assert.equal(result.decision.nodeId, 'earthrise_scene');
  assert.notEqual(result.decision.nodeId, 'create');
});

test('strips trailing braces from reasoning-like corruption and keeps stable nodeId', () => {
  const raw = JSON.stringify({
    shouldUpdate: true,
    action: 'create',
    nodeId: 'earth_3d_showcase{',
    parentId: 'main',
    title: '可旋转地球3D展示{',
    intent: '创建可旋转地球3D展示页面，带热点标注和重力感应{',
    reasoning: '用户要的是3D地球模型和空间交互，应使用3D可视化交互范式{',
    mode: 'full',
    html: '<div id="earth-3d-showcase"></div>',
    patches: [],
  });

  const result = parseHybridOutput(raw, currentNode);

  assert.equal(result.decision.nodeId, 'earth_3d_showcase');
  assert.equal(result.decision.title, '可旋转地球3D展示');
  assert.equal(result.decision.intent.endsWith('{'), false);
  assert.equal(result.decision.reasoning.endsWith('{'), false);
});

test('截断的模型输出修复后不落地（shouldUpdate=false + 显式 error）', () => {
  // 模拟 html 过长被 token 截断：JSON 在 html 字符串中途断开。
  const truncated =
    '{"shouldUpdate":true,"action":"create","nodeId":"big_page","parentId":"main",' +
    '"title":"长页面","intent":"生成","reasoning":"测试","mode":"full",' +
    '"html":"<div><section><p>很长的内容还没结束';

  const result = parseHybridOutput(truncated, currentNode);

  assert.equal(result.ok, false, '截断内容应判失败');
  assert.equal(result.decision.shouldUpdate, false, '不应落地残缺页面');
  assert.ok(result.error && result.error.includes('截断'), '应给出明确的截断错误说明');
});

test('正常完整输出不受截断保护影响（ok=true 且可落地）', () => {
  const raw = JSON.stringify({
    shouldUpdate: true,
    action: 'create',
    nodeId: 'normal_page',
    parentId: 'main',
    title: '正常页面',
    intent: '生成正常页面',
    reasoning: '完整输出',
    mode: 'full',
    html: '<div id="normal-page"><p>完整内容</p></div>',
    patches: [],
  });

  const result = parseHybridOutput(raw, currentNode);

  assert.equal(result.ok, true);
  assert.equal(result.decision.shouldUpdate, true);
  assert.equal(result.decision.nodeId, 'normal_page');
});
