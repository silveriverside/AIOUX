import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aioux-routes-memory-'));
process.env.AIOUX_SNAPSHOTS_DIR = tempRoot;

// 用无 query 的 import，保证与 routes.js 内部 import 的 memory 单例一致。
const memory = await import('./memory.js');
const {
  maybeRecordInteractionMemory,
  maybeRecordAssetMemory,
  recordRevertMemory,
} = await import('./routes.js');

test.beforeEach(async () => {
  await memory.resetMemory();
});

test.after(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test('no_update 不写入记忆画像', async () => {
  const wrote = await maybeRecordInteractionMemory({
    interaction: { text: '随便', currentCapabilities: { sceneType: 'card_browser' } },
    decision: { shouldUpdate: false, action: 'stay', nodeId: 'main' },
    currentNode: { nodeId: 'main' },
    result: { applied: false },
    variant: { id: 'card_browser__builtin' },
    traceId: 't_no_update',
  });
  assert.equal(wrote, false);
  assert.equal(memory.getPreferenceProfile().totalSignals, 0);
});

test('navigate 失败降级（applied:false）不写入记忆画像', async () => {
  const wrote = await maybeRecordInteractionMemory({
    interaction: { text: '打开不存在节点', currentCapabilities: { sceneType: 'interactive_2d' } },
    decision: { shouldUpdate: true, action: 'navigate', nodeId: 'missing' },
    currentNode: { nodeId: 'main' },
    result: { applied: false, navWarning: '目标节点不存在: missing' },
    variant: { id: 'interactive_2d__map_explore' },
    traceId: 't_nav_fail',
  });
  assert.equal(wrote, false);
  assert.equal(memory.getPreferenceProfile().totalSignals, 0);
});

test('真正成功应用后写入记忆画像', async () => {
  const wrote = await maybeRecordInteractionMemory({
    interaction: { text: '继续优化这个 3D 页面', currentCapabilities: { sceneType: 'interactive_3d' } },
    decision: { shouldUpdate: true, action: 'create', nodeId: 'earth_page', title: '地球页' },
    currentNode: { nodeId: 'main' },
    result: { nodeId: 'earth_page' },
    variant: { id: 'interactive_3d__threejs_webgl' },
    traceId: 't_success',
  });
  assert.equal(wrote, true);
  const profile = memory.getPreferenceProfile();
  assert.equal(profile.topSceneTypes[0].key, 'interactive_3d');
  assert.equal(profile.topVariants[0].key, 'interactive_3d__threejs_webgl');
  assert.ok(memory.getPageMemory('earth_page'));
});

test('revert 成功后写入负反馈', async () => {
  await maybeRecordInteractionMemory({
    interaction: { text: '卡片页', currentCapabilities: { sceneType: 'card_browser' } },
    decision: { shouldUpdate: true, action: 'stay', nodeId: 'list_page', title: '列表页' },
    currentNode: { nodeId: 'main' },
    result: { nodeId: 'list_page' },
    variant: { id: 'card_browser__editorial_grid' },
    traceId: 't_seed',
  });

  const wrote = await recordRevertMemory({
    nodeId: 'list_page',
    variantId: 'card_browser__editorial_grid',
    traceId: 't_revert',
  });
  assert.equal(wrote, true);
  const page = memory.getPageMemory('list_page');
  assert.equal(page.revertCount, 1);
  const snap = memory.getMemorySnapshot();
  assert.equal(snap.preferences.variantReverts['card_browser__editorial_grid'], 1);
});

test('真正成功应用后写入素材索引', async () => {
  const wrote = await maybeRecordAssetMemory({
    decision: { shouldUpdate: true, action: 'create', nodeId: 'ocean_page' },
    result: { nodeId: 'ocean_page' },
    assets: [
      { url: 'https://images.unsplash.com/ocean-1.jpg', type: 'image' },
    ],
  });
  assert.equal(wrote, true);
  const assets = memory.listAssetsByNode('ocean_page');
  assert.equal(assets.length, 1);
  assert.equal(assets[0].url, 'https://images.unsplash.com/ocean-1.jpg');
});

test('no_update 不写入素材索引', async () => {
  const wrote = await maybeRecordAssetMemory({
    decision: { shouldUpdate: false, action: 'stay', nodeId: 'quiet_page' },
    result: { applied: false, nodeId: 'quiet_page' },
    assets: [
      { url: 'https://images.unsplash.com/quiet.jpg', type: 'image' },
    ],
  });
  assert.equal(wrote, false);
  assert.equal(memory.listAssetsByNode('quiet_page').length, 0);
});

test('非法素材 URL 不入索引，但会记录 asset_rejected 事件', async () => {
  await maybeRecordAssetMemory({
    decision: { shouldUpdate: true, action: 'create', nodeId: 'bad_asset_page' },
    result: { nodeId: 'bad_asset_page' },
    assets: [
      { url: 'https://evil.example.com/bad.js', type: 'script' },
    ],
  });
  assert.equal(memory.listAssetsByNode('bad_asset_page').length, 0);
  const snap = memory.getMemorySnapshot();
  assert.ok(snap.events.some((e) => e.type === 'asset_rejected' && e.nodeId === 'bad_asset_page'));
});
