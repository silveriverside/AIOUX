import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const e2eScript = path.join(rootDir, 'scripts/e2e.mjs');
const realSnapshotsDir = path.join(rootDir, 'snapshots');

function runDryRun(extraEnv = {}) {
  return spawnSync(process.execPath, [e2eScript], {
    cwd: rootDir,
    env: {
      ...process.env,
      AIOUX_E2E_DRY_RUN: '1',
      ...extraEnv,
    },
    encoding: 'utf8',
  });
}

test('npm run e2e 默认使用临时 snapshots 启动隔离服务', () => {
  const result = runDryRun({ AIOUX_BASE_URL: '' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const config = JSON.parse(result.stdout);

  assert.equal(config.mode, 'managed');
  assert.notEqual(path.resolve(config.snapshotsDir), realSnapshotsDir);
  assert.match(config.baseUrl, /^http:\/\/127\.0\.0\.1:\d+$/);
});

test('显式 AIOUX_BASE_URL 时保留外部服务模式', () => {
  const result = runDryRun({ AIOUX_BASE_URL: 'http://127.0.0.1:3999' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const config = JSON.parse(result.stdout);

  assert.equal(config.mode, 'external');
  assert.equal(config.baseUrl, 'http://127.0.0.1:3999');
  assert.equal(config.snapshotsDir, null);
});
