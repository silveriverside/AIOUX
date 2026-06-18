import test from 'node:test';
import assert from 'node:assert/strict';

const {
  REUSABLE_ASSET_RANKING_WEIGHTS,
  REUSABLE_ASSET_RISK_WEIGHTS,
  buildInteractTimingPayload,
  buildMessagesWithAssets,
  computeReusableAssetRiskPenaltyScore,
  computeReusableAssetWeightedScore,
  rankReusableAssets,
} = await import('./routes.js');

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

test('复用素材会过滤低质量候选，并按 current 优先与 qualityScore 排序', async () => {
  const now = Date.now();
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
          {
            url: 'https://images.unsplash.com/current-quality.jpg',
            type: 'image',
            useCount: 3,
            usedByNodes: ['ocean_page', 'reef_page', 'kelp_page'],
            lastUsedAt: now - 1 * 24 * 60 * 60 * 1000,
          },
          {
            url: 'https://images.unsplash.com/current-count.jpg',
            type: 'image',
            useCount: 5,
            usedByNodes: ['ocean_page'],
            lastUsedAt: now - 80 * 24 * 60 * 60 * 1000,
          },
        ];
      }
      if (nodeId === 'reef_page') {
        return [
          { url: '', type: 'image', useCount: 100 },
          {
            url: 'https://images.unsplash.com/related-high.jpg',
            type: 'image',
            useCount: 4,
            usedByNodes: ['reef_page', 'ocean_page'],
            lastUsedAt: now - 3 * 24 * 60 * 60 * 1000,
          },
        ];
      }
      return [];
    },
    findRelatedPagesImpl: () => [{ nodeId: 'reef_page', title: '珊瑚礁页' }],
  });

  assert.deepEqual(result.reusedAssets.map((asset) => asset.url), [
    'https://images.unsplash.com/current-quality.jpg',
    'https://images.unsplash.com/current-count.jpg',
    'https://images.unsplash.com/related-high.jpg',
  ]);
  assert.ok(result.reusedAssets[0].quality?.score > result.reusedAssets[1].quality?.score);
  const userText = result.messages[1].content.find((part) => part.type === 'text')?.text || '';
  assert.doesNotMatch(userText, /data:image/);
  assert.doesNotMatch(userText, /placeholder/);
  assert.match(userText, /qualityScore=/);
  assert.match(userText, /qualityUse=/);
  assert.match(userText, /qualityCoverage=/);
  assert.match(userText, /qualityRecency=/);
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
  assert.equal(result.reusedPromptAssetLimit, 3);
  assert.equal(result.reusedPromptSkippedAssetCount, 1);
  const userText = result.messages[1].content.find((part) => part.type === 'text')?.text || '';
  assert.match(userText, /current-a\.jpg/);
  assert.match(userText, /related-a\.jpg/);
  assert.doesNotMatch(userText, /related-b\.jpg/);
});

test('综合分会让高覆盖低使用素材前移', () => {
  const highCoverage = {
    url: 'https://images.unsplash.com/high-coverage.jpg',
    scope: 'current',
    useCount: 1,
    quality: {
      score: 5.8,
      components: { use: 1, coverage: 4, recency: 0.8 },
    },
  };
  const highUse = {
    url: 'https://images.unsplash.com/high-use.jpg',
    scope: 'current',
    useCount: 5,
    quality: {
      score: 6,
      components: { use: 5, coverage: 1, recency: 0 },
    },
  };

  assert.ok(REUSABLE_ASSET_RANKING_WEIGHTS.coverage > REUSABLE_ASSET_RANKING_WEIGHTS.use);
  assert.ok(computeReusableAssetWeightedScore(highCoverage) > computeReusableAssetWeightedScore(highUse));
  assert.deepEqual(rankReusableAssets([highUse, highCoverage]).map((asset) => asset.url), [
    'https://images.unsplash.com/high-coverage.jpg',
    'https://images.unsplash.com/high-use.jpg',
  ]);
});

test('综合分会对低时效素材施加明确惩罚', () => {
  const recent = {
    url: 'https://images.unsplash.com/recent.jpg',
    scope: 'current',
    useCount: 3,
    quality: {
      score: 5.6,
      components: { use: 3, coverage: 2, recency: 0.6 },
    },
  };
  const stale = {
    url: 'https://images.unsplash.com/stale.jpg',
    scope: 'current',
    useCount: 3,
    quality: {
      score: 5.1,
      components: { use: 3, coverage: 2, recency: 0.1 },
    },
  };

  assert.ok(computeReusableAssetWeightedScore(recent) > computeReusableAssetWeightedScore(stale));
});

test('综合分接近或同分时继续按 url 稳定排序', () => {
  const first = {
    url: 'https://images.unsplash.com/a.jpg',
    scope: 'current',
    useCount: 2,
    quality: {
      score: 4.5,
      components: { use: 2, coverage: 2, recency: 0.5 },
    },
  };
  const second = {
    url: 'https://images.unsplash.com/b.jpg',
    scope: 'current',
    useCount: 2,
    quality: {
      score: 4.5,
      components: { use: 2, coverage: 2, recency: 0.5 },
    },
  };

  assert.equal(computeReusableAssetWeightedScore(first), computeReusableAssetWeightedScore(second));
  assert.deepEqual(rankReusableAssets([second, first]).map((asset) => asset.url), [
    'https://images.unsplash.com/a.jpg',
    'https://images.unsplash.com/b.jpg',
  ]);
});

test('风险惩罚会让高 issueCount 素材降权', () => {
  const clean = {
    url: 'https://images.unsplash.com/clean.jpg',
    scope: 'current',
    useCount: 3,
    quality: {
      score: 5.6,
      components: { use: 3, coverage: 2, recency: 0.6 },
    },
    issueCount: 0,
    revertCostCount: 0,
  };
  const risky = {
    ...clean,
    url: 'https://images.unsplash.com/risky.jpg',
    issueCount: 3,
  };

  assert.ok(REUSABLE_ASSET_RISK_WEIGHTS.issueCount > 0);
  assert.ok(computeReusableAssetRiskPenaltyScore(risky) > computeReusableAssetRiskPenaltyScore(clean));
  assert.ok(computeReusableAssetWeightedScore(clean) > computeReusableAssetWeightedScore(risky));
});

test('风险惩罚会对近期失败素材施加更高降权', () => {
  const now = Date.now();
  const recentIssue = {
    url: 'https://images.unsplash.com/recent-issue.jpg',
    scope: 'current',
    quality: {
      score: 5.6,
      components: { use: 3, coverage: 2, recency: 0.6 },
    },
    issueCount: 1,
    lastIssueAt: now - 1 * 24 * 60 * 60 * 1000,
    revertCostCount: 0,
  };
  const staleIssue = {
    ...recentIssue,
    url: 'https://images.unsplash.com/stale-issue.jpg',
    lastIssueAt: now - 90 * 24 * 60 * 60 * 1000,
  };

  assert.ok(computeReusableAssetRiskPenaltyScore(recentIssue, { now }) > computeReusableAssetRiskPenaltyScore(staleIssue, { now }));
});

test('风险惩罚会让高 revertCostCount 素材稳定后移', () => {
  const lowRisk = {
    url: 'https://images.unsplash.com/low-risk.jpg',
    scope: 'current',
    quality: {
      score: 5.6,
      components: { use: 3, coverage: 2, recency: 0.6 },
    },
    issueCount: 0,
    revertCostCount: 0,
  };
  const highRisk = {
    ...lowRisk,
    url: 'https://images.unsplash.com/high-risk.jpg',
    revertCostCount: 4,
  };

  assert.ok(computeReusableAssetRiskPenaltyScore(highRisk) > computeReusableAssetRiskPenaltyScore(lowRisk));
  assert.deepEqual(rankReusableAssets([highRisk, lowRisk]).map((asset) => asset.url), [
    'https://images.unsplash.com/low-risk.jpg',
    'https://images.unsplash.com/high-risk.jpg',
  ]);
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
      reusedPromptAssetLimit: 3,
      reusedPromptSkippedAssetCount: 1,
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
  assert.equal(payload.reusedPromptAssetLimit, 3);
  assert.equal(payload.reusedPromptSkippedAssetCount, 1);
  assert.equal(payload.timing.reusedAssetCount, 3);
  assert.equal(payload.timing.reusedPromptAssetCount, 2);
  assert.equal(payload.timing.reusedPromptAssetLimit, 3);
  assert.equal(payload.timing.reusedPromptSkippedAssetCount, 1);
});
