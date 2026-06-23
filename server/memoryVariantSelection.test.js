import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// 必须在任何会传递加载 config.js 的 import 之前设置临时目录，避免写到真实 snapshots。
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aioux-variant-dev-'));
process.env.AIOUX_SNAPSHOTS_DIR = tempRoot;

const { updateProfile, derivePreference } = await import('./memoryProfile.js');
const { createEmptyMemory } = await import('./memoryStore.js');
const snap = await import('./snapshots.js');
const graph = await import('./graph.js');
const memory = await import('./memory.js');
const { loadPresetVariants } = await import('./presetRegistry.js');
const { maybeRecordInteractionMemory } = await import('./routes.js');

test.after(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test('createEmptyMemory 含 variantSelection 计数桶（默认全 0）', () => {
  const mem = createEmptyMemory();
  assert.deepEqual(mem.preferences.variantSelection, {
    match: 0, deviate: 0, invalid: 0, absent: 0, total: 0,
  });
});

test('updateProfile 按 variantDeviation 累计偏离分类与 total', () => {
  let p = createEmptyMemory().preferences;
  p = updateProfile(p, { sceneType: 'interactive_3d', variantId: 'a', variantDeviation: 'match' });
  p = updateProfile(p, { sceneType: 'interactive_3d', variantId: 'b', variantDeviation: 'deviate' });
  p = updateProfile(p, { sceneType: 'interactive_3d', variantId: 'b', variantDeviation: 'deviate' });
  p = updateProfile(p, { sceneType: 'card_browser', variantId: null, variantDeviation: 'invalid' });
  p = updateProfile(p, { sceneType: 'card_browser', variantId: 'c', variantDeviation: 'absent' });
  assert.deepEqual(p.variantSelection, {
    match: 1, deviate: 2, invalid: 1, absent: 1, total: 5,
  });
});

test('updateProfile 无 variantDeviation 时不动偏离桶', () => {
  let p = createEmptyMemory().preferences;
  p = updateProfile(p, { sceneType: 'interactive_3d', variantId: 'a' });
  assert.deepEqual(p.variantSelection, {
    match: 0, deviate: 0, invalid: 0, absent: 0, total: 0,
  });
});

test('updateProfile 忽略非法 variantDeviation 值', () => {
  let p = createEmptyMemory().preferences;
  p = updateProfile(p, { variantId: 'a', variantDeviation: 'garbage' });
  assert.equal(p.variantSelection.total, 0);
});

test('derivePreference 暴露 variantSelection 与偏离率（deviate/(match+deviate)）', () => {
  let p = createEmptyMemory().preferences;
  p = updateProfile(p, { variantId: 'a', variantDeviation: 'match' });
  p = updateProfile(p, { variantId: 'b', variantDeviation: 'deviate' });
  p = updateProfile(p, { variantId: 'b', variantDeviation: 'deviate' });
  p = updateProfile(p, { variantId: null, variantDeviation: 'invalid' });
  p = updateProfile(p, { variantId: 'c', variantDeviation: 'absent' });
  const derived = derivePreference(p);
  assert.deepEqual(derived.variantSelection, {
    match: 1, deviate: 2, invalid: 1, absent: 1, total: 5,
  });
  // deviate / (match + deviate) = 2 / 3
  assert.equal(derived.variantDeviationRate, Math.round((2 / 3) * 1000) / 1000);
});

test('derivePreference：合法选择为 0 时偏离率为 0（避免除零）', () => {
  let p = createEmptyMemory().preferences;
  p = updateProfile(p, { variantId: null, variantDeviation: 'absent' });
  const derived = derivePreference(p);
  assert.equal(derived.variantDeviationRate, 0);
});

test('闭环：maybeRecordInteractionMemory 把偏离分类计入画像', async () => {
  await snap.initSnapshots();
  graph.initGraph();
  await loadPresetVariants({ force: true });
  await memory.resetMemory();

  // 模型自选真 3D，服务端兜底是伪 3D -> deviate。
  await maybeRecordInteractionMemory({
    interaction: { text: '可旋转地球', currentCapabilities: { sceneType: 'interactive_3d' } },
    decision: {
      shouldUpdate: true, action: 'create', nodeId: 'earth_dev', title: '地球',
      variantId: 'interactive_3d__threejs_webgl',
    },
    currentNode: { nodeId: 'main' },
    result: { nodeId: 'earth_dev' },
    variant: { id: 'interactive_3d__builtin', reason: 'fallback' },
    traceId: 't_dev_1',
  });
  // 模型未回报 -> absent。
  await maybeRecordInteractionMemory({
    interaction: { text: '卡片合集', currentCapabilities: { sceneType: 'card_browser' } },
    decision: { shouldUpdate: true, action: 'create', nodeId: 'cards_dev', title: '卡片' },
    currentNode: { nodeId: 'main' },
    result: { nodeId: 'cards_dev' },
    variant: { id: 'card_browser__editorial_grid', reason: 'keyword' },
    traceId: 't_dev_2',
  });

  const profile = memory.getPreferenceProfile();
  assert.equal(profile.variantSelection.deviate, 1);
  assert.equal(profile.variantSelection.absent, 1);
  assert.equal(profile.variantSelection.total, 2);
  assert.equal(profile.variantDeviationRate, 1); // deviate 1 /(match 0 + deviate 1)
});
