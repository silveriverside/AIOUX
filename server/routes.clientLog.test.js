import test from 'node:test';
import assert from 'node:assert/strict';

const { buildClientLogPayload } = await import('./routes.js');

test('buildClientLogPayload 接受合法 frame_render_status 并归一化字段', () => {
  const out = buildClientLogPayload({
    event: 'frame_render_status',
    traceId: 'client_123',
    detail: { ok: true, hasCanvas: true, sceneType: 'interactive_3d', error: null, nodeId: 'saturn' },
  });
  assert.equal(out.ok, true);
  assert.equal(out.payload.event, 'frame_render_status');
  assert.equal(out.payload.traceId, 'client_123');
  assert.equal(out.payload.ok, true);
  assert.equal(out.payload.hasCanvas, true);
  assert.equal(out.payload.sceneType, 'interactive_3d');
  assert.equal(out.payload.error, null);
  assert.equal(out.payload.nodeId, 'saturn');
});

test('buildClientLogPayload 保留渲染失败的 error 字符串（截断到上限）', () => {
  const longError = 'x'.repeat(900);
  const out = buildClientLogPayload({
    event: 'frame_render_status',
    detail: { ok: false, hasCanvas: false, sceneType: 'generic', error: longError },
  });
  assert.equal(out.ok, true);
  assert.equal(out.payload.ok, false);
  assert.equal(out.payload.hasCanvas, false);
  assert.ok(out.payload.error.length <= 500, 'error 应被截断到 <=500');
  assert.ok(typeof out.payload.traceId === 'string' && out.payload.traceId.length > 0, '缺失 traceId 时应生成一个');
});

test('buildClientLogPayload 拒绝未知 event', () => {
  const out = buildClientLogPayload({ event: 'evil_event', detail: { ok: true, hasCanvas: true } });
  assert.equal(out.ok, false);
  assert.match(out.error, /event/);
});

test('buildClientLogPayload 拒绝畸形 frame_render_status detail', () => {
  assert.equal(buildClientLogPayload({ event: 'frame_render_status', detail: { ok: 'yes', hasCanvas: true } }).ok, false);
  assert.equal(buildClientLogPayload({ event: 'frame_render_status', detail: { ok: true, hasCanvas: 1 } }).ok, false);
  assert.equal(buildClientLogPayload({ event: 'frame_render_status', detail: { ok: true, hasCanvas: true, sceneType: 'admin_panel' } }).ok, false);
  assert.equal(buildClientLogPayload({ event: 'frame_render_status', detail: null }).ok, false);
  assert.equal(buildClientLogPayload({ event: 'frame_render_status' }).ok, false);
});
