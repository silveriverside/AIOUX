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
  const syncUrls = [];
  page.on('request', (request) => {
    const url = request.url();
    if (url.includes('/api/sync')) syncUrls.push(url);
  });

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

  const syncStart = await page.evaluate(async () => {
    const stage = await import('/js/stage.js');
    const graphResp = await fetch('/api/graph');
    const graphBody = await graphResp.json();
    const nodeId = graphBody.graph?.current || 'main';
    stage.renderFull('<main id="e2e-root"><h1>E2E Patch Sync</h1><p>stable baseline</p></main>');
    const patch = [{
      selector: '#e2e-root',
      action: 'append',
      html: `<div class="e2e-marker">snapshot ${Date.now()}</div>`,
    }];
    const applied = stage.applyPatchesSafely(patch);
    if (!applied.ok) return { ok: false, error: applied.error };
    const response = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nodeId, html: applied.html }),
    });
    const body = await response.json();
    return { ok: response.ok, status: response.status, nodeId, body };
  });

  assert(syncStart.ok, `确定性 patch sync 启动失败: ${JSON.stringify(syncStart)}`);
  const jobId = syncStart.body?.snapshot?.jobId;
  assert(jobId, `sync 响应缺少 snapshot.jobId: ${JSON.stringify(syncStart.body)}`);

  let savedJob = null;
  let jobPolls = 0;
  for (let i = 0; i < 45; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    jobPolls += 1;
    const job = await getJson(`/api/snapshot-jobs/${encodeURIComponent(jobId)}`);
    if (job.status === 'done' || job.status === 'failed') {
      savedJob = job;
      break;
    }
  }

  assert(savedJob?.status === 'done', `快照任务未成功完成: ${JSON.stringify(savedJob)}`);
  assert(syncUrls.length >= 1, '期望确定性 patch 路径至少 1 次 /api/sync');
  assert(jobPolls >= 1, '期望至少 1 次 /api/snapshot-jobs 轮询');
  assert(savedJob.commit, `快照任务缺少 commit: ${JSON.stringify(savedJob)}`);

  console.log('[e2e] snapshot status ok');
  console.log(`[e2e] sync requests: ${syncUrls.length}`);
  console.log(`[e2e] snapshot job polls: ${jobPolls}`);
  console.log(`[e2e] saved: ${savedJob.elapsedMs}ms ${savedJob.commit.slice(0, 8)}`);
}

async function testLocalNative3d(page) {
  let interactCount = 0;
  page.on('request', (request) => {
    if (request.url().includes('/api/interact')) interactCount += 1;
  });

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    window.postMessage(
      {
        __aioux: true,
        kind: 'frame-capabilities',
        capabilities: { sceneType: 'interactive_3d', nativeInteractions: ['tap_background', 'swipe', 'drag_rotate'] },
      },
      '*'
    );
  });
  await page.waitForFunction(async () => {
    const stage = await import('/js/stage.js');
    return stage.getCapabilities().sceneType === 'interactive_3d';
  });
  await page.evaluate(() => {
    window.postMessage(
      { __aioux: true, kind: 'frame-pointer', phase: 'down', x: 100, y: 100, w: 1000, h: 1000, label: null },
      '*'
    );
    window.postMessage(
      { __aioux: true, kind: 'frame-pointer', phase: 'up', x: 100, y: 100, w: 1000, h: 1000, label: null },
      '*'
    );
  });
  await page.waitForTimeout(500);
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
    await testLocalNative3d(page);
    await testSnapshotStatus(page);
    await testBadPatchGuard(page);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('[e2e] failed');
  console.error(err.stack || err.message);
  process.exitCode = 1;
});
