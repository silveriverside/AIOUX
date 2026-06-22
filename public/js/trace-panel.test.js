import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createTracePanelState,
  formatTraceEntry,
  recordTraceEvent,
  renderTracePanel,
} from './trace-panel.js';

test('trace panel records normalized trace event summary', () => {
  const state = createTracePanelState({ limit: 4 });

  const entry = recordTraceEvent(state, 'remote_interaction', {
    traceId: 'trace_1',
    type: 'text',
    clientTiming: { totalMs: 120 },
    serverTiming: { totalMs: 90, modelMs: 70 },
  });

  assert.equal(entry.traceId, 'trace_1');
  assert.equal(entry.event, 'remote_interaction');
  assert.equal(entry.label, 'text');
  assert.equal(entry.durationMs, 120);
  assert.equal(entry.status, 'ok');
  assert.equal(state.entries.length, 1);
  assert.equal(formatTraceEntry(entry), 'remote_interaction · trace_1 · 120ms · ok');
});

test('trace panel marks errors and missing trace ids explicitly', () => {
  const state = createTracePanelState({ limit: 4 });

  const entry = recordTraceEvent(state, 'patch_apply', {
    ok: false,
    error: 'patch failed',
    timing: { patchClientMs: 18 },
  });

  assert.equal(entry.traceId, 'no-trace');
  assert.equal(entry.durationMs, 18);
  assert.equal(entry.status, 'error');
  assert.equal(entry.error, 'patch failed');
});

test('trace panel keeps newest events with ring truncation', () => {
  const state = createTracePanelState({ limit: 3 });

  for (let i = 1; i <= 5; i++) {
    recordTraceEvent(state, 'remote_interaction', {
      traceId: `trace_${i}`,
      clientTiming: { totalMs: i },
    });
  }

  assert.deepEqual(
    state.entries.map((entry) => entry.traceId),
    ['trace_5', 'trace_4', 'trace_3']
  );
});

test('trace panel renders entries and empty state', () => {
  const root = { innerHTML: '' };
  const state = createTracePanelState({ limit: 3 });

  renderTracePanel(root, state.entries);
  assert.match(root.innerHTML, /暂无 trace/);

  recordTraceEvent(state, 'remote_interaction_failed', {
    traceId: 'trace_error',
    error: 'network',
    timing: { totalMs: 42 },
  });
  renderTracePanel(root, state.entries);

  assert.match(root.innerHTML, /remote_interaction_failed/);
  assert.match(root.innerHTML, /trace_error/);
  assert.match(root.innerHTML, /42ms/);
  assert.match(root.innerHTML, /network/);
  assert.match(root.innerHTML, /trace-entry--error/);
});

test('trace panel escapes rendered fields', () => {
  const root = { innerHTML: '' };
  renderTracePanel(root, [{
    event: '<img src=x onerror=1>',
    traceId: '<script>alert(1)</script>',
    label: '<b>label</b>',
    durationMs: 1,
    status: '<svg onload=1>',
    error: '<iframe src=bad></iframe>',
  }]);

  assert.doesNotMatch(root.innerHTML, /<script>/);
  assert.doesNotMatch(root.innerHTML, /<img src=x/);
  assert.doesNotMatch(root.innerHTML, /<svg onload=1>/);
  assert.match(root.innerHTML, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(root.innerHTML, /&lt;svg onload=1&gt;/);
});
