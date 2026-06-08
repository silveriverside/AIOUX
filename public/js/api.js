// 与后端通信封装
async function post(url, body) {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `请求失败 ${resp.status}`);
  return data;
}

async function get(url) {
  const resp = await fetch(url);
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `请求失败 ${resp.status}`);
  return data;
}

export const api = {
  status: () => get('/api/status'),
  graph: () => get('/api/graph'),
  interact: (interaction) => post('/api/interact', { interaction }),
  sync: (nodeId, html) => post('/api/sync', { nodeId, html }),
  navigate: (nodeId) => post('/api/navigate', { nodeId }),
  history: (nodeId) => get(`/api/history/${nodeId}`),
  revert: (nodeId, fullHash) => post('/api/revert', { nodeId, fullHash }),
};
