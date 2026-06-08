import test from 'node:test';
import assert from 'node:assert/strict';

import {
  registerPresetVariant,
  getPresetVariant,
  listPresetVariants,
  listSceneTypes,
  selectPresetVariant,
  isAllowedAssetUrl,
  loadPresetVariants,
} from './presetRegistry.js';

test('seeds builtin variants for all four experience presets', () => {
  const sceneTypes = listSceneTypes();
  for (const scene of ['immersive_media', 'card_browser', 'interactive_2d', 'interactive_3d']) {
    assert.ok(sceneTypes.includes(scene), `缺少内置场景 ${scene}`);
    assert.ok(getPresetVariant(`${scene}__builtin`), `缺少内置变体 ${scene}__builtin`);
  }
});

test('supports multiple variants under the same sceneType and keyword selection', () => {
  registerPresetVariant({
    id: 'interactive_3d__threejs_test',
    sceneType: 'interactive_3d',
    name: 'three.js WebGL 测试变体',
    skillSource: 'threejs-test@1',
    techStack: ['three.js'],
    keywords: ['webgl', '真实感', 'threejs'],
    promptSection: '使用 three.js 渲染真实感 3D 场景，强调光照与材质。',
    acceptance: ['使用 WebGL 渲染', '至少一个可旋转主体'],
    priority: 5,
  });

  const variants3d = listPresetVariants({ sceneType: 'interactive_3d' });
  assert.ok(variants3d.length >= 2, '同一场景应允许多个变体');

  const selection = selectPresetVariant({
    text: '我要一个 webgl 真实感地球',
    currentCapabilities: { sceneType: 'interactive_3d' },
  });
  assert.equal(selection.primary.id, 'interactive_3d__threejs_test');
  assert.equal(selection.reason, 'scene_keyword');
});

test('honors explicit requested variant id when enabled', () => {
  const selection = selectPresetVariant(
    { text: '随便', currentCapabilities: { sceneType: 'interactive_3d' } },
    { requestedVariantId: 'interactive_3d__builtin' }
  );
  assert.equal(selection.primary.id, 'interactive_3d__builtin');
  assert.equal(selection.reason, 'explicit');
});

test('falls back to scene default when no keyword matches', () => {
  const selection = selectPresetVariant({
    text: '一段没有任何关键词的随机文字',
    currentCapabilities: { sceneType: 'card_browser' },
  });
  assert.equal(selection.primary.sceneType, 'card_browser');
  assert.ok(['scene_default', 'scene_keyword'].includes(selection.reason));
});

test('validates asset url whitelist', () => {
  assert.equal(isAllowedAssetUrl('https://unpkg.com/three@0.160.0/build/three.min.js'), true);
  assert.equal(isAllowedAssetUrl('https://images.unsplash.com/photo-123'), true);
  assert.equal(isAllowedAssetUrl('https://evil.example.com/x.js'), false);
  assert.equal(isAllowedAssetUrl('javascript:alert(1)'), false);
  assert.equal(isAllowedAssetUrl('not-a-url'), false);
});

test('rejects invalid variant registration', () => {
  assert.throws(() => registerPresetVariant({ id: '', sceneType: 'x', promptSection: 'y' }));
  assert.throws(() => registerPresetVariant({ id: 'a', sceneType: '', promptSection: 'y' }));
  assert.throws(() => registerPresetVariant({ id: 'a', sceneType: 'x', promptSection: '' }));
});

test('loads variant files from variants directory and registers them', async () => {
  const result = await loadPresetVariants({ force: true });
  assert.ok(result.loaded >= 1, `期望至少加载 1 个变体文件，实际 ${result.loaded}`);
  // 内置 + 至少一个目录变体后，3D 场景应有多个变体可选。
  const variants3d = listPresetVariants({ sceneType: 'interactive_3d' });
  assert.ok(variants3d.length >= 2, '加载变体后 3D 场景应有多个变体');
});

