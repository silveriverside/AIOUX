import test from 'node:test';
import assert from 'node:assert/strict';

import {
  loadPresetVariants,
  getPresetVariant,
  listPresetVariants,
  selectPresetVariant,
  isAllowedAssetUrl,
} from './presetRegistry.js';

test('registers css3d_lite and gsap_motion 3D variants', async () => {
  await loadPresetVariants({ force: true });
  assert.ok(getPresetVariant('interactive_3d__css3d_lite'), '缺少 css3d_lite 变体');
  assert.ok(getPresetVariant('interactive_3d__gsap_motion'), '缺少 gsap_motion 变体');
  const variants3d = listPresetVariants({ sceneType: 'interactive_3d' });
  assert.ok(variants3d.length >= 3, `3D 场景应至少有 3 个变体，实际 ${variants3d.length}`);
});

test('selects css3d_lite by lightweight keywords', async () => {
  await loadPresetVariants({ force: true });
  const sel = selectPresetVariant({
    text: '要一个轻量的 css3d 卡片翻转，不用 webgl',
    currentCapabilities: { sceneType: 'interactive_3d' },
  });
  assert.equal(sel.primary.id, 'interactive_3d__css3d_lite');
});

test('selects gsap_motion by scroll/animation keywords', async () => {
  await loadPresetVariants({ force: true });
  const sel = selectPresetVariant({
    text: '用 gsap 做滚动驱动的视差入场动效叙事',
    currentCapabilities: { sceneType: 'interactive_3d' },
  });
  assert.equal(sel.primary.id, 'interactive_3d__gsap_motion');
});

test('3D variant CDN domains are within asset whitelist', () => {
  assert.equal(isAllowedAssetUrl('https://cdn.jsdelivr.net/npm/gsap@3.15/dist/gsap.min.js'), true);
  assert.equal(isAllowedAssetUrl('https://unpkg.com/gsap@3.15/dist/ScrollTrigger.min.js'), true);
});
