import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aioux-memory-'));
process.env.AIOUX_SNAPSHOTS_DIR = tempRoot;

const memory = await import(`./memory.js?case=${Date.now()}`);

test.after(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test('recordInteraction 后 getPreferenceProfile 反映信号', async () => {
  await memory.resetMemory();
  await memory.recordInteraction({
    interaction: { text: '做一个 3D 旋转的立体场景', currentCapabilities: { sceneType: 'interactive_3d' } },
    decision: { shouldUpdate: true, action: 'create', nodeId: 'earth', title: '地球' },
    currentNode: { nodeId: 'main' },
    variant: { id: 'interactive_3d__threejs' },
  });
  const profile = memory.getPreferenceProfile();
  assert.equal(profile.topSceneTypes[0].key, 'interactive_3d');
  assert.equal(profile.topVariants[0].key, 'interactive_3d__threejs');
  assert.ok(profile.threeDAffinity >= 1);
  assert.ok(memory.getPageMemory('earth'));
});

test('shouldUpdate=false 不污染画像', async () => {
  await memory.resetMemory();
  await memory.recordInteraction({
    interaction: { text: '随便', currentCapabilities: { sceneType: 'card_browser' } },
    decision: { shouldUpdate: false },
    currentNode: { nodeId: 'main' },
  });
  const profile = memory.getPreferenceProfile();
  assert.equal(profile.totalSignals, 0);
  assert.equal(profile.topSceneTypes.length, 0);
});

test('并发多次 recordInteraction 计数无丢失', async () => {
  await memory.resetMemory();
  const jobs = [];
  for (let i = 0; i < 20; i += 1) {
    jobs.push(memory.recordInteraction({
      interaction: { text: '卡片合集', currentCapabilities: { sceneType: 'card_browser' } },
      decision: { shouldUpdate: true, action: 'stay', nodeId: 'main' },
      variant: { id: 'card_browser__builtin' },
    }));
  }
  await Promise.all(jobs);
  const profile = memory.getPreferenceProfile();
  assert.equal(profile.totalSignals, 20);
  assert.equal(profile.topSceneTypes[0].count, 20);
  // 落盘内容也应一致（串行写无覆盖丢失）
  const snap = memory.getMemorySnapshot();
  assert.equal(snap.preferences.variantCounts['card_browser__builtin'], 20);
});

test('recordAssetUsage 白名单内外区分', async () => {
  await memory.resetMemory();
  await memory.recordAssetUsage({
    nodeId: 'earth',
    assets: [
      { url: 'https://images.unsplash.com/photo-1.jpg', type: 'image' }, // 白名单内
      { url: 'https://evil.example.com/x.js', type: 'script' }, // 白名单外
    ],
  });
  const assets = memory.listAssetsByNode('earth');
  assert.equal(assets.length, 1);
  assert.equal(assets[0].url, 'https://images.unsplash.com/photo-1.jpg');
  assert.ok(assets[0].usedByNodes.includes('earth'));
  const snap = memory.getMemorySnapshot();
  assert.ok(snap.events.some((e) => e.type === 'asset_rejected'));
});

test('recordAssetUsage 记录素材最近使用时间质量信号', async () => {
  await memory.resetMemory();
  await memory.recordAssetUsage({
    nodeId: 'earth',
    assets: [{ url: 'https://images.unsplash.com/reuse-quality.jpg', type: 'image' }],
  });
  const first = memory.listAssetsByNode('earth')[0];
  assert.equal(typeof first.lastUsedAt, 'number');
  assert.equal(first.lastUsedAt, first.updatedAt);

  await new Promise((resolve) => setTimeout(resolve, 5));
  await memory.recordAssetUsage({
    nodeId: 'earth',
    assets: [{ url: 'https://images.unsplash.com/reuse-quality.jpg', type: 'image' }],
  });
  const second = memory.listAssetsByNode('earth')[0];
  assert.equal(second.createdAt, first.createdAt);
  assert.ok(second.lastUsedAt >= first.lastUsedAt);
  assert.equal(second.lastUsedAt, second.updatedAt);
  assert.equal(second.useCount, 2);
});

test('recordAssetIssueSignal 会把素材失效次数与最近失败时间写回到 memory.assets', async () => {
  await memory.resetMemory();
  await memory.recordAssetIssueSignal({
    url: 'https://images.unsplash.com/broken-risk.jpg',
    type: 'image',
  });
  const firstSnap = memory.getMemorySnapshot();
  const first = Object.values(firstSnap.assets)[0];
  assert.equal(first.url, 'https://images.unsplash.com/broken-risk.jpg');
  assert.equal(first.issueCount, 1);
  assert.equal(typeof first.lastIssueAt, 'number');
  assert.equal(first.revertCostCount, 0);

  await new Promise((resolve) => setTimeout(resolve, 5));
  await memory.recordAssetIssueSignal({
    url: 'https://images.unsplash.com/broken-risk.jpg',
    type: 'image',
  });
  const second = Object.values(memory.getMemorySnapshot().assets)[0];
  assert.equal(second.issueCount, 2);
  assert.ok(second.lastIssueAt >= first.lastIssueAt);
});

test('scoreAssetQuality 基于使用次数、节点覆盖和最近使用时间输出可解释分数', () => {
  const now = Date.UTC(2026, 0, 31);
  const recent = memory.scoreAssetQuality({
    useCount: 4,
    usedByNodes: ['earth', 'mars'],
    lastUsedAt: now - 2 * 24 * 60 * 60 * 1000,
  }, { now });
  const stale = memory.scoreAssetQuality({
    useCount: 1,
    usedByNodes: ['earth'],
    lastUsedAt: now - 60 * 24 * 60 * 60 * 1000,
  }, { now });

  assert.deepEqual(recent.components, {
    use: 4,
    coverage: 2,
    recency: 0.933,
  });
  assert.equal(recent.score, 6.933);
  assert.equal(stale.components.recency, 0);
  assert.ok(recent.score > stale.score);
});

test('recordRevert 累加 revertCount 与 variantReverts', async () => {
  await memory.resetMemory();
  await memory.recordInteraction({
    interaction: { text: '卡片', currentCapabilities: { sceneType: 'card_browser' } },
    decision: { shouldUpdate: true, action: 'stay', nodeId: 'list' },
    variant: { id: 'card_browser__builtin' },
  });
  await memory.recordRevert({ nodeId: 'list', variantId: 'card_browser__builtin' });
  const page = memory.getPageMemory('list');
  assert.equal(page.revertCount, 1);
  const snap = memory.getMemorySnapshot();
  assert.equal(snap.preferences.variantReverts['card_browser__builtin'], 1);
});

test('recordRevert 会给当前节点关联素材累加 revertCostCount 代理信号', async () => {
  await memory.resetMemory();
  await memory.recordAssetUsage({
    nodeId: 'list',
    assets: [
      { url: 'https://images.unsplash.com/revert-a.jpg', type: 'image' },
      { url: 'https://images.unsplash.com/revert-b.jpg', type: 'image' },
    ],
  });
  await memory.recordAssetUsage({
    nodeId: 'other',
    assets: [{ url: 'https://images.unsplash.com/other.jpg', type: 'image' }],
  });

  await memory.recordRevert({ nodeId: 'list', variantId: 'card_browser__builtin' });
  const snap = memory.getMemorySnapshot();
  const byUrl = Object.fromEntries(Object.values(snap.assets).map((asset) => [asset.url, asset]));
  assert.equal(byUrl['https://images.unsplash.com/revert-a.jpg'].revertCostCount, 1);
  assert.equal(byUrl['https://images.unsplash.com/revert-b.jpg'].revertCostCount, 1);
  assert.equal(byUrl['https://images.unsplash.com/other.jpg'].revertCostCount, 0);
});
