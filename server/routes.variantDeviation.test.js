import test from 'node:test';
import assert from 'node:assert/strict';

const { classifyVariantSelection, buildInteractTimingPayload, resolveEffectiveVariant } = await import('./routes.js');
const { loadPresetVariants } = await import('./presetRegistry.js');

test.before(async () => {
  await loadPresetVariants({ force: true });
});

test('classifyVariantSelection：模型选与兜底相同 -> match', () => {
  const r = classifyVariantSelection(
    { id: 'interactive_3d__threejs_webgl' },
    { variantId: 'interactive_3d__threejs_webgl' }
  );
  assert.equal(r, 'match');
});

test('classifyVariantSelection：模型选另一个合法变体 -> deviate', () => {
  const r = classifyVariantSelection(
    { id: 'interactive_3d__builtin' },
    { variantId: 'interactive_3d__threejs_webgl' }
  );
  assert.equal(r, 'deviate');
});

test('classifyVariantSelection：无兜底但模型选合法变体 -> deviate', () => {
  const r = classifyVariantSelection(null, { variantId: 'interactive_3d__threejs_webgl' });
  assert.equal(r, 'deviate');
});

test('classifyVariantSelection：模型回报未注册 id -> invalid', () => {
  const r = classifyVariantSelection(
    { id: 'interactive_3d__builtin' },
    { variantId: 'ghost_variant' }
  );
  assert.equal(r, 'invalid');
});

test('classifyVariantSelection：模型未回报 variantId -> absent', () => {
  assert.equal(classifyVariantSelection({ id: 'interactive_3d__builtin' }, {}), 'absent');
  assert.equal(classifyVariantSelection({ id: 'interactive_3d__builtin' }, { variantId: '' }), 'absent');
  assert.equal(classifyVariantSelection({ id: 'interactive_3d__builtin' }, { variantId: 123 }), 'absent');
});

test('resolveEffectiveVariant 与 classifyVariantSelection 行为一致（deviate 时采用模型选择）', () => {
  const fallback = { id: 'interactive_3d__builtin', reason: 'fallback' };
  const decision = { variantId: 'interactive_3d__threejs_webgl' };
  assert.equal(classifyVariantSelection(fallback, decision), 'deviate');
  assert.equal(resolveEffectiveVariant(fallback, decision).id, 'interactive_3d__threejs_webgl');
});

test('buildInteractTimingPayload 暴露 modelVariantId 与 variantDeviation', () => {
  const payload = buildInteractTimingPayload({
    traceId: 't_dev',
    interaction: { type: 'text', currentCapabilities: { sceneType: 'interactive_3d' } },
    selectedVariant: { id: 'interactive_3d__builtin', reason: 'fallback' },
    decision: { action: 'create', mode: 'full', nodeId: 'earth', variantId: 'interactive_3d__threejs_webgl' },
    applied: true,
    timing: { totalMs: 100 },
  });
  assert.equal(payload.variantId, 'interactive_3d__builtin');
  assert.equal(payload.modelVariantId, 'interactive_3d__threejs_webgl');
  assert.equal(payload.variantDeviation, 'deviate');
});

test('buildInteractTimingPayload 无模型 variantId 时 modelVariantId=none、deviation=absent', () => {
  const payload = buildInteractTimingPayload({
    traceId: 't_abs',
    interaction: { type: 'text', currentCapabilities: { sceneType: 'interactive_3d' } },
    selectedVariant: { id: 'interactive_3d__builtin', reason: 'fallback' },
    decision: { action: 'stay', mode: 'full', nodeId: 'main' },
    applied: true,
    timing: { totalMs: 50 },
  });
  assert.equal(payload.modelVariantId, 'none');
  assert.equal(payload.variantDeviation, 'absent');
});
