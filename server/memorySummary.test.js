import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMemorySection } from './memorySummary.js';

test('空记忆/冷启动返回空字符串', () => {
  const res = buildMemorySection(
    { text: '随便' },
    { nodeId: 'main' },
    { profile: { totalSignals: 0, topSceneTypes: [], topVariants: [], topKeywords: [], motionAffinity: 0, threeDAffinity: 0 }, relatedPages: [], pageMemory: null }
  );
  assert.equal(res.text, '');
  assert.equal(res.used, false);
  // 可被 filter(Boolean) 忽略
  assert.equal([res.text].filter(Boolean).length, 0);
});

test('有偏好时含 topScenes/topKeywords 且带诉求优先声明', () => {
  const profile = {
    totalSignals: 5,
    topSceneTypes: [{ key: 'interactive_3d', count: 3 }],
    topVariants: [{ key: 'interactive_3d__threejs', count: 3, reverts: 0, net: 3 }],
    topKeywords: [{ key: '科技', count: 2 }, { key: '渐变', count: 1 }],
    motionAffinity: 2,
    threeDAffinity: 1,
  };
  const res = buildMemorySection(
    { text: '继续' },
    { nodeId: 'earth' },
    { profile, relatedPages: [{ nodeId: 'space_station' }], pageMemory: { useCount: 2, revertCount: 0, keywords: ['科技'] } }
  );
  assert.equal(res.used, true);
  assert.match(res.text, /interactive_3d/);
  assert.match(res.text, /科技/);
  assert.match(res.text, /动效偏好/);
  assert.match(res.text, /3D 偏好/);
  assert.match(res.text, /以诉求为准/);
});
