import test from 'node:test';
import assert from 'node:assert/strict';

const { buildMessagesWithAssets } = await import('./routes.js');

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
