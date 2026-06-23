import test from 'node:test';
import assert from 'node:assert/strict';

import { buildMessages, parseHybridOutput } from './intent.js';
import { loadPresetVariants, selectPresetVariant } from './presetRegistry.js';
import { SYSTEM_PROMPT } from './prompt.js';
import { resetMemory } from './memory.js';

const currentNode = { nodeId: 'main', title: '主页', html: '' };
const graphSummary = [{ nodeId: 'main', title: '主页', parentId: null }];

test.beforeEach(async () => {
  await resetMemory();
});

test('buildMessages 把当前场景的全部候选变体注入 prompt 供模型自选', async () => {
  await loadPresetVariants({ force: true });
  const interaction = {
    type: 'text',
    text: '做一个可旋转的地球',
    currentCapabilities: { sceneType: 'interactive_3d' },
  };
  const messages = buildMessages(interaction, currentNode, graphSummary);
  const text = messages[1].content[0].text;
  assert.ok(text.includes('interactive_3d__threejs_webgl'), '应注入真 3D（WebGL）候选');
  assert.ok(text.includes('interactive_3d__css3d_lite'), '应注入纯 CSS 3D 候选');
  assert.ok(text.includes('interactive_3d__gsap_motion'), '应注入 GSAP 候选');
});

test('注入文本包含效果优先与真实几何体必须真 3D 的规则', async () => {
  await loadPresetVariants({ force: true });
  const interaction = {
    type: 'text',
    text: '做一个可旋转的地球',
    currentCapabilities: { sceneType: 'interactive_3d' },
  };
  const messages = buildMessages(interaction, currentNode, graphSummary);
  const text = messages[1].content[0].text;
  assert.ok(text.includes('真实几何体'), '应包含真实几何体规则');
  assert.ok(/WebGL/i.test(text), '应要求真实几何体使用 WebGL');
  assert.ok(text.includes('variantId'), '应要求模型回报所选 variantId');
});

test('注入文本不再强制锁定单个变体', async () => {
  await loadPresetVariants({ force: true });
  const interaction = {
    type: 'text',
    text: '做一个可旋转的地球',
    currentCapabilities: { sceneType: 'interactive_3d' },
  };
  const messages = buildMessages(interaction, currentNode, graphSummary);
  const text = messages[1].content[0].text;
  assert.equal(text.includes('本次优先采用的预设变体'), false, '不应再单点锁定变体');
});

test('关键词兜底：真实几何体地球应回退到真 3D 变体而非伪 3D', async () => {
  await loadPresetVariants({ force: true });
  const sel = selectPresetVariant({
    text: '可旋转地球',
    currentCapabilities: { sceneType: 'interactive_3d' },
  });
  assert.equal(sel.primary.id, 'interactive_3d__threejs_webgl');
});

test('关键词兜底：星球/天体类真实几何体也回退到真 3D 变体', async () => {
  await loadPresetVariants({ force: true });
  const sel = selectPresetVariant({
    text: '展示一个可旋转的火星行星',
    currentCapabilities: { sceneType: 'interactive_3d' },
  });
  assert.equal(sel.primary.id, 'interactive_3d__threejs_webgl');
});

test('伪 3D 关键词仍可选到 CSS 3D 变体（不被真 3D 误抢）', async () => {
  await loadPresetVariants({ force: true });
  const sel = selectPresetVariant({
    text: '要一个轻量的 css3d 卡片翻转，不用 webgl',
    currentCapabilities: { sceneType: 'interactive_3d' },
  });
  assert.equal(sel.primary.id, 'interactive_3d__css3d_lite');
});

test('SYSTEM_PROMPT 包含效果优先的真实几何体真 3D 规则', () => {
  assert.ok(SYSTEM_PROMPT.includes('真实几何体'), 'SYSTEM_PROMPT 应包含真实几何体规则');
  assert.ok(/WebGL/i.test(SYSTEM_PROMPT), 'SYSTEM_PROMPT 应要求真实几何体使用 WebGL');
});

test('模型回报的 variantId 被保留为可观测字段', async () => {
  await loadPresetVariants({ force: true });
  const raw = JSON.stringify({
    shouldUpdate: true,
    action: 'create',
    nodeId: 'earth_3d_globe',
    parentId: 'main',
    title: '可旋转地球',
    intent: '生成真实 3D 地球',
    reasoning: '真实几何体应用 WebGL',
    mode: 'full',
    html: '<div id="earth-3d-globe"></div>',
    patches: [],
    variantId: 'interactive_3d__threejs_webgl',
  });
  const res = parseHybridOutput(raw, currentNode);
  assert.equal(res.ok, true, '带 variantId 的完整输出应可落地');
  assert.equal(res.decision.variantId, 'interactive_3d__threejs_webgl');
});

test('非字符串 variantId 被显式门禁拒绝落地', () => {
  const raw = JSON.stringify({
    shouldUpdate: true,
    action: 'create',
    nodeId: 'bad_variant',
    parentId: 'main',
    title: '非法 variantId',
    intent: '测试',
    reasoning: '测试',
    mode: 'full',
    html: '<div></div>',
    patches: [],
    variantId: 123,
  });
  const res = parseHybridOutput(raw, currentNode);
  assert.equal(res.ok, false);
  assert.equal(res.decision.shouldUpdate, false);
  assert.ok(res.error && res.error.includes('variantId'), '应明确说明 variantId 类型非法');
});
