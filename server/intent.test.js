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
