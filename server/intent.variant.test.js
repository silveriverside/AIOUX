import test from 'node:test';
import assert from 'node:assert/strict';

import { buildMessages } from './intent.js';
import { loadPresetVariants } from './presetRegistry.js';

const currentNode = { nodeId: 'main', title: '主页', html: '' };
const graphSummary = [{ nodeId: 'main', title: '主页', parentId: null }];

test('buildMessages 回填 observe.variant 与 observe.selectMs', async () => {
  await loadPresetVariants({ force: true });
  const interaction = {
    type: 'text',
    text: '做一个可旋转的真实感地球 webgl 3D 展示',
    currentCapabilities: { sceneType: 'interactive_3d' },
  };
  const observe = {};
  buildMessages(interaction, currentNode, graphSummary, observe);
  assert.ok(observe.variant, 'observe.variant 应被回填');
  assert.equal(typeof observe.variant.id, 'string');
  assert.equal(observe.variant.sceneType, 'interactive_3d');
  assert.ok(typeof observe.variant.reason === 'string');
  assert.ok(typeof observe.selectMs === 'number', 'observe.selectMs 应为数字');
  assert.ok(observe.selectMs >= 0);
});

test('observe.variant 含可观测字段（id/name/sceneType/skillSource/priority/reason）', async () => {
  await loadPresetVariants({ force: true });
  const interaction = {
    type: 'text',
    text: '做一个摄影作品集瀑布流画廊图集',
    currentCapabilities: { sceneType: 'card_browser' },
  };
  const observe = {};
  buildMessages(interaction, currentNode, graphSummary, observe);
  assert.equal(observe.variant.id, 'card_browser__masonry_gallery');
  for (const key of ['id', 'name', 'sceneType', 'skillSource', 'priority', 'reason']) {
    assert.ok(key in observe.variant, `observe.variant 缺少字段 ${key}`);
  }
});

test('不传 observe 时与传 observe 时生成的 messages 完全一致（纯增量、不污染 prompt）', async () => {
  await loadPresetVariants({ force: true });
  const interaction = {
    type: 'text',
    text: '做一个电影分镜滚动叙事',
    currentCapabilities: { sceneType: 'immersive_media' },
  };
  const withoutObserve = buildMessages(interaction, currentNode, graphSummary);
  const observe = {};
  const withObserve = buildMessages(interaction, currentNode, graphSummary, observe);
  assert.deepEqual(withObserve, withoutObserve, '回填 observe 不应改变 messages 内容');
  assert.ok(observe.variant, '回填仍应发生');
});
