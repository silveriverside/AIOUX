import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aioux-variant-wb-'));
process.env.AIOUX_SNAPSHOTS_DIR = tempRoot;

// 用无 query 的 import，保证与 routes.js 内部 import 的 memory 单例一致。
const graph = await import('./graph.js');
const memory = await import('./memory.js');
const snap = await import('./snapshots.js');
const { loadPresetVariants } = await import('./presetRegistry.js');
const { maybeRecordInteractionMemory, resolveEffectiveVariant } = await import('./routes.js');

test.before(async () => {
  await snap.initSnapshots();
  graph.initGraph();
  await loadPresetVariants({ force: true });
});

test.beforeEach(async () => {
  await memory.resetMemory();
});

test.after(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test('模型自报的合法 variantId 闭环写入画像（覆盖服务端兜底）', async () => {
  await maybeRecordInteractionMemory({
    interaction: { text: '做一个可旋转地球', currentCapabilities: { sceneType: 'interactive_3d' } },
    decision: {
      shouldUpdate: true,
      action: 'create',
      nodeId: 'earth_page',
      title: '地球页',
      variantId: 'interactive_3d__threejs_webgl',
    },
    currentNode: { nodeId: 'main' },
    result: { nodeId: 'earth_page' },
    // 服务端兜底选了伪 3D，但模型实际选择了真 3D，画像应记录模型选择。
    variant: { id: 'interactive_3d__builtin', reason: 'fallback' },
    traceId: 't_model_pick',
  });
  const profile = memory.getPreferenceProfile();
  assert.equal(profile.topVariants[0].key, 'interactive_3d__threejs_webgl');
});

test('模型回报的非法 variantId 回退到服务端兜底变体', async () => {
  await maybeRecordInteractionMemory({
    interaction: { text: '做一个卡片合集', currentCapabilities: { sceneType: 'card_browser' } },
    decision: {
      shouldUpdate: true,
      action: 'create',
      nodeId: 'cards_page',
      title: '卡片页',
      variantId: 'not_a_real_variant_id',
    },
    currentNode: { nodeId: 'main' },
    result: { nodeId: 'cards_page' },
    variant: { id: 'card_browser__editorial_grid', reason: 'keyword' },
    traceId: 't_bad_pick',
  });
  const profile = memory.getPreferenceProfile();
  assert.equal(profile.topVariants[0].key, 'card_browser__editorial_grid');
});

test('resolveEffectiveVariant：合法 variantId 优先于兜底', () => {
  const eff = resolveEffectiveVariant(
    { id: 'interactive_3d__builtin', reason: 'fallback' },
    { variantId: 'interactive_3d__threejs_webgl' }
  );
  assert.equal(eff.id, 'interactive_3d__threejs_webgl');
  assert.equal(eff.reason, 'model_selected');
});

test('resolveEffectiveVariant：非法/缺失 variantId 回退兜底', () => {
  const fallback = { id: 'card_browser__editorial_grid', reason: 'keyword' };
  assert.equal(resolveEffectiveVariant(fallback, { variantId: 'ghost' }).id, fallback.id);
  assert.equal(resolveEffectiveVariant(fallback, { variantId: null }).id, fallback.id);
  assert.equal(resolveEffectiveVariant(fallback, {}).id, fallback.id);
});

test('resolveEffectiveVariant：无兜底但模型选合法变体时仍可用', () => {
  const eff = resolveEffectiveVariant(null, { variantId: 'interactive_3d__threejs_webgl' });
  assert.equal(eff.id, 'interactive_3d__threejs_webgl');
  assert.equal(eff.reason, 'model_selected');
});
