import test from 'node:test';
import assert from 'node:assert/strict';
import { updateProfile, derivePreference, extractKeywords } from './memoryProfile.js';

test('create 信号计数递增', () => {
  let p = undefined;
  p = updateProfile(p, { sceneType: 'interactive_3d', variantId: 'v1', text: '一个普通页面' });
  p = updateProfile(p, { sceneType: 'interactive_3d', variantId: 'v1', text: '又一个页面' });
  p = updateProfile(p, { sceneType: 'card_browser', variantId: 'v2', text: '卡片合集' });
  assert.equal(p.sceneTypeCounts.interactive_3d, 2);
  assert.equal(p.sceneTypeCounts.card_browser, 1);
  assert.equal(p.variantCounts.v1, 2);
  assert.equal(p.totalSignals, 3);
});

test('动效/3D 词命中累加 affinity 并计入关键词', () => {
  let p = updateProfile(undefined, { text: '加点 GSAP 视差动画' });
  assert.equal(p.motionAffinity, 1);
  p = updateProfile(p, { text: '做一个 3D 旋转的立体 WebGL 场景' });
  assert.equal(p.threeDAffinity, 1);
  assert.ok(p.keywordCounts['gsap'] >= 1 || p.keywordCounts['视差'] >= 1);
  assert.ok(extractKeywords('3d webgl').includes('3d'));
});

test('revert 使 derivePreference 中变体排序下移', () => {
  let p = undefined;
  // v_hot 用 3 次，v_cold 用 2 次，初始 v_hot 排前
  p = updateProfile(p, { variantId: 'v_hot' });
  p = updateProfile(p, { variantId: 'v_hot' });
  p = updateProfile(p, { variantId: 'v_hot' });
  p = updateProfile(p, { variantId: 'v_cold' });
  p = updateProfile(p, { variantId: 'v_cold' });
  let derived = derivePreference(p);
  assert.equal(derived.topVariants[0].key, 'v_hot');
  // v_hot 连续负反馈：net = 3 - 3 = 0，跌破 v_cold(net=2)
  p = updateProfile(p, { variantId: 'v_hot', reverted: true });
  p = updateProfile(p, { variantId: 'v_hot', reverted: true });
  p = updateProfile(p, { variantId: 'v_hot', reverted: true });
  derived = derivePreference(p);
  assert.equal(derived.topVariants[0].key, 'v_cold');
});
