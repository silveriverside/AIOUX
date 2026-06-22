const DEFAULT_LIMIT = 12;

export function createTracePanelState({ limit = DEFAULT_LIMIT } = {}) {
  return {
    limit: Math.max(1, Number(limit) || DEFAULT_LIMIT),
    entries: [],
  };
}

export function recordTraceEvent(state, event, detail = {}) {
  const entry = normalizeTraceEntry(event, detail);
  state.entries.unshift(entry);
  if (state.entries.length > state.limit) {
    state.entries.length = state.limit;
  }
  return entry;
}

export function normalizeTraceEntry(event, detail = {}) {
  const status = detail.error || detail.ok === false ? 'error' : 'ok';
  return {
    event: String(event || 'unknown'),
    traceId: String(detail.traceId || 'no-trace'),
    label: String(detail.type || detail.action || detail.mode || ''),
    durationMs: pickDuration(detail),
    status,
    error: detail.error ? String(detail.error) : '',
  };
}

export function formatTraceEntry(entry) {
  return `${entry.event} · ${entry.traceId} · ${entry.durationMs ?? '-'}ms · ${entry.status}`;
}

export function renderTracePanel(root, entries = []) {
  if (!root) return;
  if (!entries.length) {
    root.innerHTML = '<div class="trace-empty">暂无 trace，完成一次交互后显示。</div>';
    return;
  }
  root.innerHTML = entries.map(renderTraceEntry).join('');
}

function renderTraceEntry(entry) {
  const statusClass = entry.status === 'error' ? 'trace-entry--error' : 'trace-entry--ok';
  const label = entry.label ? `<span class="trace-label">${escapeHtml(entry.label)}</span>` : '';
  const error = entry.error ? `<div class="trace-error">${escapeHtml(entry.error)}</div>` : '';
  return [
    `<article class="trace-entry ${statusClass}">`,
    '<div class="trace-entry-main">',
    `<strong>${escapeHtml(entry.event)}</strong>`,
    label,
    `<span class="trace-duration">${entry.durationMs ?? '-'}ms</span>`,
    '</div>',
    `<div class="trace-entry-meta"><code>${escapeHtml(entry.traceId)}</code><span>${escapeHtml(entry.status)}</span></div>`,
    error,
    '</article>',
  ].join('');
}

function pickDuration(detail) {
  const candidates = [
    detail.clientTiming?.totalMs,
    detail.timing?.totalMs,
    detail.timing?.patchClientMs,
    detail.timing?.renderMs,
    detail.serverTiming?.totalMs,
    detail.serverTiming?.modelMs,
  ];
  const value = candidates.find((item) => typeof item === 'number' && Number.isFinite(item));
  return typeof value === 'number' ? Math.round(value) : null;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
