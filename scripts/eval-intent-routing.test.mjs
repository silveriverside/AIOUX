import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cases } from '../public/js/route-interaction.cases.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const evalScript = path.join(rootDir, 'scripts/eval-intent-routing.mjs');

function runEval(extraArgs = []) {
  return spawnSync(process.execPath, [evalScript, ...extraArgs], {
    cwd: rootDir,
    encoding: 'utf8',
  });
}

test('意图路由评估脚本输出 JSON 汇总', () => {
  const result = runEval(['--json']);
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const report = JSON.parse(result.stdout);
  assert.equal(report.total, cases.length);
  assert.equal(report.failed, 0);
  assert.equal(report.passed, report.total);
  assert.equal(report.accuracy, 1);
  assert.ok(report.byCategory.some((row) => row.category === 'text_create' && row.total >= 3));
  assert.deepEqual(report.failures, []);
});

test('意图路由评估脚本在文本模式输出准确率', () => {
  const result = runEval();
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Intent routing evaluator/);
  assert.match(result.stdout, /accuracy=100\.00%/);
});
