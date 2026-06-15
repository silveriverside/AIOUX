import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const evalScript = path.join(rootDir, 'scripts/eval-asset-quality.mjs');

function createMemoryFixture() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aioux-asset-quality-'));
  const now = Date.UTC(2026, 0, 31);
  const memory = {
    version: 1,
    updatedAt: now,
    pages: {},
    assets: {
      recent: {
        assetKey: 'recent',
        url: 'https://images.unsplash.com/recent.jpg',
        type: 'image',
        useCount: 4,
        usedByNodes: ['earth', 'mars'],
        createdAt: now - 10,
        updatedAt: now - 2 * 24 * 60 * 60 * 1000,
        lastUsedAt: now - 2 * 24 * 60 * 60 * 1000,
      },
      stale: {
        assetKey: 'stale',
        url: 'https://images.unsplash.com/stale.jpg',
        type: 'image',
        useCount: 1,
        usedByNodes: ['earth'],
        createdAt: now - 100,
        updatedAt: now - 60 * 24 * 60 * 60 * 1000,
        lastUsedAt: now - 60 * 24 * 60 * 60 * 1000,
      },
    },
    preferences: {},
    events: [],
  };
  fs.writeFileSync(path.join(tempRoot, 'memory.json'), JSON.stringify(memory), 'utf8');
  return { tempRoot, now };
}

function runEval(tempRoot, now, extraArgs = []) {
  return spawnSync(process.execPath, [evalScript, ...extraArgs], {
    cwd: rootDir,
    env: {
      ...process.env,
      AIOUX_SNAPSHOTS_DIR: tempRoot,
      AIOUX_ASSET_QUALITY_NOW: String(now),
    },
    encoding: 'utf8',
  });
}

test('素材质量评估脚本输出按质量分排序的 JSON', () => {
  const { tempRoot, now } = createMemoryFixture();
  try {
    const result = runEval(tempRoot, now, ['--json']);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);

    assert.equal(report.total, 2);
    assert.equal(report.assets[0].url, 'https://images.unsplash.com/recent.jpg');
    assert.equal(report.assets[0].quality.score, 6.933);
    assert.equal(report.assets[1].url, 'https://images.unsplash.com/stale.jpg');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('素材质量评估脚本文本模式输出摘要', () => {
  const { tempRoot, now } = createMemoryFixture();
  try {
    const result = runEval(tempRoot, now);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /Asset quality evaluator/);
    assert.match(result.stdout, /total=2/);
    assert.match(result.stdout, /top=https:\/\/images\.unsplash\.com\/recent\.jpg score=6\.933/);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
