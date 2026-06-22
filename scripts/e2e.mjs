import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
let BASE_URL = process.env.AIOUX_BASE_URL || '';
const LOCAL_3D_NODE = process.env.AIOUX_E2E_3D_NODE || 'earth_3d_showcase';
const MODEL_TIMEOUT_MS = Number(process.env.AIOUX_E2E_MODEL_TIMEOUT_MS || 120000);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function buildRuntimeConfig() {
  if (process.env.AIOUX_BASE_URL) {
    return {
      mode: 'external',
      baseUrl: process.env.AIOUX_BASE_URL,
      snapshotsDir: null,
      port: null,
    };
  }

  const port = await findFreePort();
  const snapshotsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aioux-e2e-snapshots-'));
  return {
    mode: 'managed',
    baseUrl: `http://127.0.0.1:${port}`,
    snapshotsDir,
    port,
  };
}

async function waitForManagedServer(child, baseUrl, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let exited = false;
  let logs = '';
  child.stdout.on('data', (chunk) => { logs += chunk.toString(); });
  child.stderr.on('data', (chunk) => { logs += chunk.toString(); });
  child.once('exit', (code, signal) => {
    exited = true;
    logs += `\n[e2e] managed server exited code=${code} signal=${signal}`;
  });

  while (Date.now() < deadline) {
    if (exited) throw new Error(`隔离 E2E 服务提前退出:\n${logs}`);
    try {
      const response = await fetch(`${baseUrl}/api/status`);
      if (response.ok) return;
    } catch {
      // 服务尚未监听，继续短轮询。
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`隔离 E2E 服务启动超时:\n${logs}`);
}

async function startManagedServer(runtime) {
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      PORT: String(runtime.port),
      AIOUX_SNAPSHOTS_DIR: runtime.snapshotsDir,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await waitForManagedServer(child, runtime.baseUrl);
  return child;
}

async function stopManagedServer(child) {
  if (!child || child.killed) return;
  child.kill('SIGTERM');
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (!child.killed) child.kill('SIGKILL');
      resolve();
    }, 3000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function cleanupRuntime(runtime) {
  if (runtime?.mode === 'managed' && runtime.snapshotsDir) {
    fs.rmSync(runtime.snapshotsDir, { recursive: true, force: true });
  }
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
  await page.waitForFunction(() => !!document.querySelector('#status-text')?.textContent);

  await page.evaluate(async () => {
    const stage = await import('/js/stage.js');
    stage.renderFull(`
      <script>
        window.__AIOUX_CAPABILITIES__ = {
          sceneType: 'interactive_3d',
          nativeInteractions: ['tap_background', 'swipe', 'drag_rotate']
        };
      <\/script>
      <main style="width:100vw;height:100vh;display:grid;place-items:center;background:#07111f;color:white">
        <button id="tap-target" style="width:240px;height:120px">real iframe tap</button>
      </main>
    `);
    document.getElementById('welcome')?.classList.add('hidden');
  });
  await page.waitForFunction(async () => {
    const stage = await import('/js/stage.js');
    return stage.getCapabilities().sceneType === 'interactive_3d';
  });

  const spoofResult = await page.evaluate(async () => {
    const stage = await import('/js/stage.js');
    const beforeCaps = stage.getCapabilities();
    const beforeStatus = document.querySelector('#status-text')?.textContent || '';
    window.dispatchEvent(new MessageEvent('message', {
      data: {
        __aioux: true,
        kind: 'frame-capabilities',
        capabilities: { sceneType: 'card_browser', nativeInteractions: ['tap_filter'] },
      },
    }));
    window.dispatchEvent(new MessageEvent('message', {
      data: { __aioux: true, kind: 'frame-pointer', phase: 'down', x: 100, y: 100, w: 1000, h: 1000, label: null },
    }));
    window.dispatchEvent(new MessageEvent('message', {
      data: { __aioux: true, kind: 'frame-pointer', phase: 'up', x: 100, y: 100, w: 1000, h: 1000, label: null },
    }));
    await new Promise((resolve) => setTimeout(resolve, 250));
    return {
      beforeCaps,
      afterCaps: stage.getCapabilities(),
      beforeStatus,
      afterStatus: document.querySelector('#status-text')?.textContent || '',
    };
  });

  assert(spoofResult.afterCaps.sceneType === 'interactive_3d', `伪造 capabilities 不应改变 sceneType: ${JSON.stringify(spoofResult)}`);
  assert(spoofResult.afterStatus === spoofResult.beforeStatus, `伪造 pointer 不应改变状态栏: ${JSON.stringify(spoofResult)}`);

  await page.frameLocator('#stage').locator('#tap-target').click();
  await page.waitForTimeout(500);
  const statusText = await page.textContent('#status-text');
  const caps = await page.evaluate(async () => (await import('/js/stage.js')).getCapabilities());

  assert(interactCount === 0, `3D 本地点击不应触发 /api/interact，实际 ${interactCount}`);
  assert(statusText?.includes('未触发重新生成'), `状态栏未显示本地处理结果: ${statusText}; caps=${JSON.stringify(caps)}`);

  console.log('[e2e] sandbox bridge auth + local 3D interaction ok');
  console.log(`[e2e] status: ${statusText}`);
}

async function testInlineScriptSandboxBoundary(page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!document.querySelector('#status-text')?.textContent);

  const result = await page.evaluate(async () => {
    const stage = await import('/js/stage.js');
    const beforeStatus = document.querySelector('#status-text')?.textContent || '';
    const testId = `inline_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    window.__e2eInlineScriptReport = null;
    const onInlineBoundaryMessage = (event) => {
      if (event.data?.__e2eInlineScriptBoundary && event.data.testId === testId) {
        window.__e2eInlineScriptReport = event.data;
        window.removeEventListener('message', onInlineBoundaryMessage);
      }
    };
    window.addEventListener('message', onInlineBoundaryMessage);
    stage.renderFull(`
      <script>
        var AIOUX_E2E_INLINE_TEST_ID = ${JSON.stringify(testId)};
        window.__AIOUX_CAPABILITIES__ = { sceneType: 'interactive_2d', nativeInteractions: ['pan'] };
        var parentAccessBlocked = false;
        try {
          parent.document.body.dataset.inlineBreakout = 'yes';
        } catch (err) {
          parentAccessBlocked = true;
        }
        parent.postMessage({
          __e2eInlineScriptBoundary: true,
          testId: AIOUX_E2E_INLINE_TEST_ID,
          inlineRan: true,
          parentAccessBlocked: parentAccessBlocked
        }, '*');
        parent.postMessage({
          __aioux: true,
          kind: 'frame-capabilities',
          nonce: 'wrong-inline-nonce',
          capabilities: { sceneType: 'card_browser', nativeInteractions: ['tap_filter'] }
        }, '*');
        parent.postMessage({
          __aioux: true,
          kind: 'frame-pointer',
          nonce: 'wrong-inline-nonce',
          phase: 'down',
          x: 10,
          y: 10,
          w: 100,
          h: 100,
          label: null
        }, '*');
        parent.postMessage({
          __aioux: true,
          kind: 'frame-pointer',
          nonce: 'wrong-inline-nonce',
          phase: 'up',
          x: 10,
          y: 10,
          w: 100,
          h: 100,
          label: null
        }, '*');
        setTimeout(function(){
          document.body.dispatchEvent(new PointerEvent('pointerdown', {
            bubbles: true,
            clientX: 10,
            clientY: 10,
            pointerId: 1
          }));
          document.body.dispatchEvent(new PointerEvent('pointerup', {
            bubbles: true,
            clientX: 80,
            clientY: 10,
            pointerId: 1
          }));
        }, 20);
      <\/script>
      <main>inline script boundary</main>
    `);
    return {
      beforeStatus,
      testId,
    };
  });

  await page.waitForFunction(async () => {
    const stage = await import('/js/stage.js');
    return stage.getCapabilities().sceneType === 'interactive_2d';
  });
  await page.waitForFunction(() => window.__e2eInlineScriptReport?.inlineRan === true);
  await page.waitForTimeout(250);

  const after = await page.evaluate(async () => {
    const stage = await import('/js/stage.js');
    return {
      caps: stage.getCapabilities(),
      status: document.querySelector('#status-text')?.textContent || '',
      parentBreakout: document.body.dataset.inlineBreakout || '',
      inlineReport: window.__e2eInlineScriptReport,
    };
  });

  assert(after.inlineReport?.inlineRan, `内联脚本应在 sandbox iframe 内执行: ${JSON.stringify(after)}`);
  assert(after.inlineReport?.parentAccessBlocked, `内联脚本不应访问父页面 DOM: ${JSON.stringify(after)}`);
  assert(!after.parentBreakout, `内联脚本不应污染父页面 DOM: ${JSON.stringify(after)}`);
  assert(after.caps.sceneType === 'interactive_2d', `合法 bridge capabilities 应保持，错误 nonce 不应覆盖: ${JSON.stringify(after)}`);
  assert(after.status === result.beforeStatus, `错误 nonce 的内联 pointer 不应触发交互状态变化: ${JSON.stringify({ result, after })}`);

  console.log('[e2e] inline script sandbox boundary ok');
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
  const runtime = await buildRuntimeConfig();
  BASE_URL = runtime.baseUrl;
  if (process.env.AIOUX_E2E_DRY_RUN === '1') {
    console.log(JSON.stringify({
      mode: runtime.mode,
      baseUrl: runtime.baseUrl,
      snapshotsDir: runtime.snapshotsDir,
    }));
    cleanupRuntime(runtime);
    return;
  }

  let managedServer = null;
  let browser = null;
  try {
    if (runtime.mode === 'managed') {
      managedServer = await startManagedServer(runtime);
      console.log(`[e2e] managed server: ${runtime.baseUrl}`);
      console.log(`[e2e] snapshots dir: ${runtime.snapshotsDir}`);
    }

    await checkServer();
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    await testLocalNative3d(page);
    await testInlineScriptSandboxBoundary(page);
    await testSnapshotStatus(page);
    await testBadPatchGuard(page);
  } finally {
    if (browser) await browser.close();
    await stopManagedServer(managedServer);
    cleanupRuntime(runtime);
  }
}

main().catch((err) => {
  console.error('[e2e] failed');
  console.error(err.stack || err.message);
  process.exitCode = 1;
});
