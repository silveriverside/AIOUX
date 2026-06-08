import test from 'node:test';
import assert from 'node:assert/strict';

import {
  loadPresetVariants,
  getPresetVariant,
  listPresetVariants,
  selectPresetVariant,
} from './presetRegistry.js';

test('registers svg_dataviz, map_explore and timeline_story 2D variants', async () => {
  await loadPresetVariants({ force: true });
  assert.ok(getPresetVariant('interactive_2d__svg_dataviz'), '缺少 svg_dataviz 变体');
  assert.ok(getPresetVariant('interactive_2d__map_explore'), '缺少 map_explore 变体');
  assert.ok(getPresetVariant('interactive_2d__timeline_story'), '缺少 timeline_story 变体');
  const variants2d = listPresetVariants({ sceneType: 'interactive_2d' });
  assert.ok(variants2d.length >= 4, `2D 场景应至少有 4 个变体，实际 ${variants2d.length}`);
});

test('selects map_explore by geo keywords', async () => {
  await loadPresetVariants({ force: true });
  const sel = selectPresetVariant({
    text: '展示各城市的地理分布热力地图',
    currentCapabilities: { sceneType: 'interactive_2d' },
  });
  assert.equal(sel.primary.id, 'interactive_2d__map_explore');
});

test('selects svg_dataviz by chart keywords', async () => {
  await loadPresetVariants({ force: true });
  const sel = selectPresetVariant({
    text: '画一个销量柱状图和散点图',
    currentCapabilities: { sceneType: 'interactive_2d' },
  });
  assert.equal(sel.primary.id, 'interactive_2d__svg_dataviz');
});

test('selects timeline_story by timeline keywords', async () => {
  await loadPresetVariants({ force: true });
  const sel = selectPresetVariant({
    text: '做一个公司发展历程的时间线里程碑',
    currentCapabilities: { sceneType: 'interactive_2d' },
  });
  assert.equal(sel.primary.id, 'interactive_2d__timeline_story');
});
