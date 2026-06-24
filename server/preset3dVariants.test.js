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

test('threejs_webgl 变体要求裸说明符导入且禁止自带 importmap', async () => {
  await loadPresetVariants({ force: true });
  const variant = getPresetVariant('interactive_3d__threejs_webgl');
  assert.ok(variant, '缺少 threejs_webgl 变体');
  const prompt = variant.promptSection;
  assert.match(prompt, /from ['"]three['"]/, 'prompt 应要求 import ... from "three" 裸说明符');
  assert.match(prompt, /three\/addons\//, 'prompt 应要求 three/addons/ 路径导入 OrbitControls');
  assert.match(prompt, /importmap/, 'prompt 应明确提及 importmap 由宿主注入');
  assert.match(prompt, /(禁止|不要|不得|勿)[^；]*importmap/, 'prompt 应禁止模型自写 importmap');
  // 禁止再引导模型用完整 CDN URL 做 import（这是导致 OrbitControls 裸导入失败的旧根因）
  assert.doesNotMatch(prompt, /通过\s*CDN（unpkg 或 jsdelivr）以 ES module 方式引入/, '不应再保留诱导完整 URL import 的旧文案');
});

test('threejs_webgl 变体要求视觉元素必须是可见 3D 或表面元素而非文字热点', async () => {
  await loadPresetVariants({ force: true });
  const variant = getPresetVariant('interactive_3d__threejs_webgl');
  assert.ok(variant, '缺少 threejs_webgl 变体');
  const prompt = variant.promptSection;
  const acceptance = variant.acceptance.join('；');
  const combined = `${prompt}；${acceptance}`;

  assert.match(combined, /光环.*(RingGeometry|环带|几何体)/, '土星光环应要求用可见 ring/环带几何体表达');
  assert.match(combined, /卫星.*(SphereGeometry|小球|轨道)/, '卫星应要求用小球体/轨道等可见 3D 元素表达');
  assert.match(combined, /风暴.*(表面|纹理|漩涡|斑点)/, '风暴应要求作为行星表面纹理/漩涡/斑点表达');
  assert.match(combined, /热点.*(不能|不得|禁止).*替代/, '热点圈只能辅助说明，不能替代主体视觉元素');
});
