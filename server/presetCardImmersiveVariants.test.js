import test from 'node:test';
import assert from 'node:assert/strict';

import {
  loadPresetVariants,
  getPresetVariant,
  listPresetVariants,
  selectPresetVariant,
} from './presetRegistry.js';

test('registers card_browser editorial_grid and masonry_gallery variants', async () => {
  await loadPresetVariants({ force: true });
  assert.ok(getPresetVariant('card_browser__editorial_grid'), '缺少 editorial_grid 变体');
  assert.ok(getPresetVariant('card_browser__masonry_gallery'), '缺少 masonry_gallery 变体');
  const cards = listPresetVariants({ sceneType: 'card_browser' });
  assert.ok(cards.length >= 3, `卡片场景应至少有 3 个变体，实际 ${cards.length}`);
});

test('registers immersive_media cinematic_scroll and hero_parallax variants', async () => {
  await loadPresetVariants({ force: true });
  assert.ok(getPresetVariant('immersive_media__cinematic_scroll'), '缺少 cinematic_scroll 变体');
  assert.ok(getPresetVariant('immersive_media__hero_parallax'), '缺少 hero_parallax 变体');
  const immersive = listPresetVariants({ sceneType: 'immersive_media' });
  assert.ok(immersive.length >= 3, `沉浸场景应至少有 3 个变体，实际 ${immersive.length}`);
});

test('selects editorial_grid by editorial/magazine keywords', async () => {
  await loadPresetVariants({ force: true });
  const sel = selectPresetVariant({
    text: '做一个城市美食精选攻略合集，杂志策展排版',
    currentCapabilities: { sceneType: 'card_browser' },
  });
  assert.equal(sel.primary.id, 'card_browser__editorial_grid');
});

test('selects masonry_gallery by gallery/photo keywords', async () => {
  await loadPresetVariants({ force: true });
  const sel = selectPresetVariant({
    text: '做一个摄影作品集瀑布流画廊图集',
    currentCapabilities: { sceneType: 'card_browser' },
  });
  assert.equal(sel.primary.id, 'card_browser__masonry_gallery');
});

test('selects cinematic_scroll by cinematic/narrative keywords', async () => {
  await loadPresetVariants({ force: true });
  const sel = selectPresetVariant({
    text: '用电影分镜的方式做一个纪录片式滚动叙事',
    currentCapabilities: { sceneType: 'immersive_media' },
  });
  assert.equal(sel.primary.id, 'immersive_media__cinematic_scroll');
});

test('selects hero_parallax by hero/parallax keywords', async () => {
  await loadPresetVariants({ force: true });
  const sel = selectPresetVariant({
    text: '做一个单屏震撼首屏 hero 视差大图',
    currentCapabilities: { sceneType: 'immersive_media' },
  });
  assert.equal(sel.primary.id, 'immersive_media__hero_parallax');
});

test('specialized card/immersive variants outrank builtin seed', async () => {
  await loadPresetVariants({ force: true });
  const card = selectPresetVariant({
    text: '杂志策展合集排版',
    currentCapabilities: { sceneType: 'card_browser' },
  });
  assert.ok(!card.primary.id.endsWith('__builtin'), '卡片专用变体不应被 builtin 压制');
  const immersive = selectPresetVariant({
    text: '电影分镜滚动叙事氛围',
    currentCapabilities: { sceneType: 'immersive_media' },
  });
  assert.ok(!immersive.primary.id.endsWith('__builtin'), '沉浸专用变体不应被 builtin 压制');
});
