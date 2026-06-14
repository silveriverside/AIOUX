import test from 'node:test';
import assert from 'node:assert/strict';

const { buildInteractTimingPayload, buildMessagesWithAssets } = await import('./routes.js');

test('资产解析成功后会把素材上下文追加到 prompt，且保留现有 observe 回填', async () => {
  const observe = {};
  const result = await buildMessagesWithAssets({
    interaction: {
      type: 'text',
      text: '做一个真实感海洋探索页面',
      targetLabel: '海洋主视觉',
      currentCapabilities: { sceneType: 'immersive_media' },
    },
    currentNode: {
      nodeId: 'main',
      title: '主页',
      html: '<main>hello</main>',
    },
    graphSummary: [{ nodeId: 'main', title: '主页', parentId: null }],
    observe,
    traceId: 't_asset_prompt',
    resolveAssetsImpl: async (reqList) => {
      assert.equal(reqList.length, 1);
      assert.equal(reqList[0].type, 'image');
      assert.equal(reqList[0].opts.traceId, 't_asset_prompt');
      return [{
        type: 'image',
        source: 'unsplash',
        url: 'https://images.unsplash.com/ocean.png',
        degraded: false,
        issueId: null,
        fromCache: false,
      }];
    },
  });

  assert.ok(result.assetTimingMs >= 0);
  assert.equal(result.assets.length, 1);
  assert.ok(observe.variant, 'observe.variant 应继续由 buildMessages 回填');

  const userText = result.messages[1].content.find((part) => part.type === 'text')?.text || '';
  assert.match(userText, /【可复用素材参考】/);
  assert.match(userText, /https:\/\/images\.unsplash\.com\/ocean\.png/);
  assert.match(userText, /degraded=false/);
});

test('资产解析失败时保留原始 prompt，并显式返回错误信息供上层记录', async () => {
  const errors = [];
  const result = await buildMessagesWithAssets({
    interaction: {
      type: 'text',
      text: '做一个城市封面页',
      currentCapabilities: { sceneType: 'card_browser' },
    },
    currentNode: {
      nodeId: 'main',
      title: '主页',
      html: '<main>hello</main>',
    },
    graphSummary: [{ nodeId: 'main', title: '主页', parentId: null }],
    traceId: 't_asset_fail',
    resolveAssetsImpl: async () => {
      throw new Error('asset resolver offline');
    },
    logger: {
      error: (...args) => errors.push(args.join(' ')),
    },
  });

  assert.equal(result.assets.length, 0);
  assert.equal(result.assetError, 'asset resolver offline');
  assert.ok(result.assetTimingMs >= 0);
  assert.equal(errors.length, 1);

  const userText = result.messages[1].content.find((part) => part.type === 'text')?.text || '';
  assert.doesNotMatch(userText, /【可复用素材参考】/);
});

test('当前节点历史素材会作为复用参考注入 prompt', async () => {
  const result = await buildMessagesWithAssets({
    interaction: {
      type: 'text',
      text: '继续沿用这个海洋视觉风格',
      currentCapabilities: { sceneType: 'immersive_media' },
    },
    currentNode: {
      nodeId: 'ocean_page',
      title: '海洋页',
      html: '<main>ocean</main>',
    },
    graphSummary: [{ nodeId: 'ocean_page', title: '海洋页', parentId: 'main' }],
    traceId: 't_reuse_assets',
    resolveAssetsImpl: async () => [],
    listReusableAssetsImpl: (nodeId) => {
      assert.equal(nodeId, 'ocean_page');
      return [{
        url: 'https://images.unsplash.com/reused-ocean.jpg',
        type: 'image',
        useCount: 2,
      }];
    },
  });

  assert.equal(result.reusedAssets.length, 1);
  const userText = result.messages[1].content.find((part) => part.type === 'text')?.text || '';
  assert.match(userText, /【历史素材复用参考】/);
  assert.match(userText, /https:\/\/images\.unsplash\.com\/reused-ocean\.jpg/);
  assert.match(userText, /useCount=2/);
});

test('相关页面历史素材会作为复用参考注入 prompt，并与当前节点素材去重', async () => {
  const result = await buildMessagesWithAssets({
    interaction: {
      type: 'text',
      text: '继续做海洋沉浸页',
      targetLabel: '海洋',
      currentCapabilities: { sceneType: 'immersive_media' },
    },
    currentNode: {
      nodeId: 'ocean_page',
      title: '海洋页',
      html: '<main>ocean</main>',
    },
    graphSummary: [{ nodeId: 'ocean_page', title: '海洋页', parentId: 'main' }],
    traceId: 't_related_assets',
    resolveAssetsImpl: async () => [],
    listReusableAssetsImpl: (nodeId) => {
      if (nodeId === 'ocean_page') {
        return [{ url: 'https://images.unsplash.com/shared.jpg', type: 'image', useCount: 3 }];
      }
      if (nodeId === 'reef_page') {
        return [
          { url: 'https://images.unsplash.com/shared.jpg', type: 'image', useCount: 1 },
          { url: 'https://images.unsplash.com/reef.jpg', type: 'image', useCount: 2 },
        ];
      }
      return [];
    },
    findRelatedPagesImpl: () => [{ nodeId: 'reef_page', title: '珊瑚礁页' }],
  });

  assert.equal(result.reusedAssets.length, 2);
  assert.deepEqual(result.reusedAssetStats, {
    total: 2,
    current: 1,
    related: 1,
  });
  const urls = result.reusedAssets.map((asset) => asset.url);
  assert.deepEqual(urls, [
    'https://images.unsplash.com/shared.jpg',
    'https://images.unsplash.com/reef.jpg',
  ]);
  const userText = result.messages[1].content.find((part) => part.type === 'text')?.text || '';
  assert.match(userText, /reef_page/);
  assert.match(userText, /https:\/\/images\.unsplash\.com\/reef\.jpg/);
});

test('复用素材会过滤低质量候选，并按 current 优先与 useCount 排序', async () => {
  const result = await buildMessagesWithAssets({
    interaction: {
      type: 'text',
      text: '继续优化海洋页面',
      currentCapabilities: { sceneType: 'immersive_media' },
    },
    currentNode: {
      nodeId: 'ocean_page',
      title: '海洋页',
      html: '<main>ocean</main>',
    },
    graphSummary: [{ nodeId: 'ocean_page', title: '海洋页', parentId: 'main' }],
    traceId: 't_rank_assets',
    resolveAssetsImpl: async () => [],
    listReusableAssetsImpl: (nodeId) => {
      if (nodeId === 'ocean_page') {
        return [
          { url: 'data:image/svg+xml;base64,placeholder', type: 'image', useCount: 99 },
          { url: 'https://images.unsplash.com/current-low.jpg', type: 'image', useCount: 1 },
          { url: 'https://images.unsplash.com/current-high.jpg', type: 'image', useCount: 5 },
        ];
      }
      if (nodeId === 'reef_page') {
        return [
          { url: '', type: 'image', useCount: 100 },
          { url: 'https://images.unsplash.com/related-high.jpg', type: 'image', useCount: 10 },
        ];
      }
      return [];
    },
    findRelatedPagesImpl: () => [{ nodeId: 'reef_page', title: '珊瑚礁页' }],
  });

  assert.deepEqual(result.reusedAssets.map((asset) => asset.url), [
    'https://images.unsplash.com/current-high.jpg',
    'https://images.unsplash.com/current-low.jpg',
    'https://images.unsplash.com/related-high.jpg',
  ]);
  const userText = result.messages[1].content.find((part) => part.type === 'text')?.text || '';
  assert.doesNotMatch(userText, /data:image/);
  assert.doesNotMatch(userText, /placeholder/);
});

test('复用素材统计会区分召回数量与实际注入 prompt 数量', async () => {
  const result = await buildMessagesWithAssets({
    interaction: {
      type: 'text',
      text: '继续优化海洋页面',
      currentCapabilities: { sceneType: 'immersive_media' },
    },
    currentNode: {
      nodeId: 'ocean_page',
      title: '海洋页',
      html: '<main>ocean</main>',
    },
    graphSummary: [{ nodeId: 'ocean_page', title: '海洋页', parentId: 'main' }],
    traceId: 't_prompt_asset_stats',
    resolveAssetsImpl: async () => [],
    listReusableAssetsImpl: (nodeId) => {
      if (nodeId === 'ocean_page') {
        return [
          { url: 'https://images.unsplash.com/current-a.jpg', type: 'image', useCount: 4 },
          { url: 'https://images.unsplash.com/current-b.jpg', type: 'image', useCount: 3 },
        ];
      }
      if (nodeId === 'reef_page') {
        return [
          { url: 'https://images.unsplash.com/related-a.jpg', type: 'image', useCount: 2 },
          { url: 'https://images.unsplash.com/related-b.jpg', type: 'image', useCount: 1 },
        ];
      }
      return [];
    },
    findRelatedPagesImpl: () => [{ nodeId: 'reef_page', title: '珊瑚礁页' }],
  });

  assert.deepEqual(result.reusedAssetStats, {
    total: 4,
    current: 2,
    related: 2,
  });
  assert.deepEqual(result.reusedPromptAssetStats, {
    total: 3,
    current: 2,
    related: 1,
  });
  const userText = result.messages[1].content.find((part) => part.type === 'text')?.text || '';
  assert.match(userText, /current-a\.jpg/);
  assert.match(userText, /related-a\.jpg/);
  assert.doesNotMatch(userText, /related-b\.jpg/);
});

test('交互 timing 日志摘要会在顶层暴露复用素材统计', () => {
  const payload = buildInteractTimingPayload({
    traceId: 't_log_assets',
    interaction: {
      type: 'text',
      intentHint: 'refine_current',
      currentCapabilities: { sceneType: 'immersive_media' },
    },
    selectedVariant: { id: 'immersive-a', reason: 'scene-match' },
    decision: { action: 'stay', mode: 'full', nodeId: 'ocean_page' },
    applied: true,
    timing: {
      totalMs: 1200,
      reusedAssetCount: 3,
      reusedCurrentAssetCount: 1,
      reusedRelatedAssetCount: 2,
      reusedPromptAssetCount: 2,
      reusedPromptCurrentAssetCount: 1,
      reusedPromptRelatedAssetCount: 1,
    },
    extra: 'snapshot=async',
  });

  assert.equal(payload.event, 'interact');
  assert.equal(payload.reusedAssetCount, 3);
  assert.equal(payload.reusedCurrentAssetCount, 1);
  assert.equal(payload.reusedRelatedAssetCount, 2);
  assert.equal(payload.reusedPromptAssetCount, 2);
  assert.equal(payload.reusedPromptCurrentAssetCount, 1);
  assert.equal(payload.reusedPromptRelatedAssetCount, 1);
  assert.equal(payload.timing.reusedAssetCount, 3);
  assert.equal(payload.timing.reusedPromptAssetCount, 2);
});
