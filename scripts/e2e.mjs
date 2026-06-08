import { chromium } from 'playwright';

const BASE_URL = process.env.AIOUX_BASE_URL || 'http://localhost:3000';
const LOCAL_3D_NODE = process.env.AIOUX_E2E_3D_NODE || 'earth_3d_showcase';
const MODEL_TIMEOUT_MS = Number(process.env.AIOUX_E2E_MODEL_TIMEOUT_MS || 120000);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function getJson(path, options) {
  const response = await fetch(`${BASE_URL}${path}`, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `${path} failed with ${response.status}`);
  return body;
}

async function checkServer() {
  const status = await getJson('/api/status');
  assert(status.hasApiKey, 'STEPFUN_API_KEY 未配置，无法运行模型生成 E2E');
  console.log('[e2e] server ok');
}

async function testSnapshotStatus(page) {
  const interactUrls = [];
  const syncUrls = [];
  const jobUrls = [];
  page.on('request', (request) => {
    const url = request.url();
    if (url.includes('/api/interact')) interactUrls.push(url);
    if (url.includes('/api/sync')) syncUrls.push(url);
    if (url.includes('/api/snapshot-jobs/')) jobUrls.push(url);
  });

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.fill(
    '#prompt-input',
    `在当前页面右上角加一个 E2E 快照状态验证标记 ${Date.now()}，保持当前页面，不要创建新页面。`
  );
  await page.click('#prompt-send');

  await page.waitForFunction(
    () => document.querySelector('#status-text')?.textContent.includes('快照后台保存中'),
    null,
    { timeout: MODEL_TIMEOUT_MS }
  );
  const savingText = await page.textContent('#status-text');

  await page.waitForFunction(
    () => document.querySelector('#status-text')?.textContent.includes('快照已保存'),
    null,
    { timeout: MODEL_TIMEOUT_MS }
  );
  const savedText = await page.textContent('#status-text');

  assert(interactUrls.length === 1, `期望 1 次 /api/interact，实际 ${interactUrls.length}`);
  assert(syncUrls.length >= 1, '期望 patch 路径至少 1 次 /api/sync');
  assert(jobUrls.length >= 1, '期望至少 1 次 /api/snapshot-jobs 轮询');
  assert(/快照已保存 · \d+ms · [0-9a-f]{8}/.test(savedText || ''), `保存状态缺少耗时或 hash: ${savedText}`);

  console.log('[e2e] snapshot status ok');
  console.log(`[e2e] sync requests: ${syncUrls.length}`);
  console.log(`[e2e] saving: ${savingText}`);
  console.log(`[e2e] saved: ${savedText}`);
}

async function testLocalNative3d(page) {
  const graph = await getJson('/api/graph');
  const nodes = graph.graph?.nodes || {};
  if (!nodes[LOCAL_3D_NODE]) {
    console.warn(`[e2e] skip local 3D test: missing node ${LOCAL_3D_NODE}`);
    return;
  }

  await getJson('/api/navigate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nodeId: LOCAL_3D_NODE }),
  });

  let interactCount = 0;
  page.on('request', (request) => {
    if (request.url().includes('/api/interact')) interactCount += 1;
  });

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const box = await page.locator('#stage').boundingBox();
  assert(box, 'stage iframe 不存在');

  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(1500);
  const statusText = await page.textContent('#status-text');

  assert(interactCount === 0, `3D 本地点击不应触发 /api/interact，实际 ${interactCount}`);
  assert(statusText?.includes('未触发重新生成'), `状态栏未显示本地处理结果: ${statusText}`);

  console.log('[e2e] local 3D interaction ok');
  console.log(`[e2e] status: ${statusText}`);
}

async function testBadPatchGuard(page) {
  let syncCount = 0;
  page.on('request', (request) => {
    if (request.url().includes('/api/sync')) syncCount += 1;
  });

  const result = await page.evaluate(async () => {
    const stage = await import('/js/stage.js');
    const before = stage.getCurrentHtml();
    const patch = [{ selector: 'body > *', action: 'remove' }];
    const applied = stage.applyPatchesSafely(patch);
    const after = stage.getCurrentHtml();
    return {
      ok: applied.ok,
      error: applied.error || '',
      restored: before === after,
      beforeLength: before.length,
      afterLength: after.length,
    };
  });

  assert(!result.ok, '坏 patch 应被拒绝');
  assert(result.error.includes('patch 风险过高'), `坏 patch 应在预检阶段被风险评分拦截: ${result.error}`);
  assert(result.restored, `坏 patch 后页面未回滚: ${JSON.stringify(result)}`);
  assert(syncCount === 0, `坏 patch 不应触发 /api/sync，实际 ${syncCount}`);

  console.log('[e2e] bad patch guard ok');
  console.log(`[e2e] bad patch error: ${result.error}`);
}

async function main() {
  await checkServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  try {
    await testSnapshotStatus(page);
    await testBadPatchGuard(page);
    await testLocalNative3d(page);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('[e2e] failed');
  console.error(err.stack || err.message);
  process.exitCode = 1;
});
