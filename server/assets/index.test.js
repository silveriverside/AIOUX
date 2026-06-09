import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aioux-assets-index-'));
process.env.AIOUX_ASSETS_DIR = tempRoot;

// 预置本地库索引
fs.mkdirSync(path.join(tempRoot, 'library'), { recursive: true });
fs.writeFileSync(
  path.join(tempRoot, 'library', 'index.json'),
  JSON.stringify([
    { id: 'local1', type: 'image', path: 'library/local1.png', tags: ['ocean', 'sky'], title: 'ocean sky' },
  ]),
  'utf8'
);

const mod = await import(`./index.js?case=${Date.now()}`);

test.after(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

const throwingFetch = () => {
  throw new Error('fetch should NOT be called');
};

test('local hit returns source=local without touching online (fetch never called)', async () => {
  const res = await mod.resolveAsset({
    type: 'image',
    keywords: ['ocean', 'sky'],
    opts: { fetchImpl: throwingFetch },
  });
  assert.equal(res.source, 'local');
  assert.equal(res.degraded, false);
  assert.equal(res.url, 'library/local1.png');
  assert.equal(res.fromCache, false);
});

test('online success caches; second call hits cache without re-probing', async () => {
  let probeCalls = 0;
  const okFetch = async () => {
    probeCalls += 1;
    return { status: 200, url: 'https://images.unsplash.com/final.png' };
  };
  const first = await mod.resolveAsset({
    type: 'image',
    keywords: ['mountain'],
    opts: { style: 'realistic', fetchImpl: okFetch },
  });
  assert.equal(first.degraded, false);
  assert.equal(first.source, 'unsplash');
  assert.equal(first.fromCache, false);

  const second = await mod.resolveAsset({
    type: 'image',
    keywords: ['mountain'],
    opts: { style: 'realistic', fetchImpl: throwingFetch },
  });
  assert.equal(second.fromCache, true);
  assert.equal(second.degraded, false);
  // probe 仅第一次发生
  assert.equal(probeCalls, 1);
});

test('all online sources failing -> degraded:true with issueId recorded', async () => {
  const issuesMod = await import(`./issues.js?case=${Date.now()}`);
  const before = issuesMod.listAssetIssues().length;
  const failFetch = async () => ({ status: 503, url: 'https://source.unsplash.com/x' });
  const res = await mod.resolveAsset({
    type: 'image',
    keywords: ['nonexistent_keyword_xyz'],
    opts: { style: 'realistic', fetchImpl: failFetch },
  });
  assert.equal(res.degraded, true);
  assert.ok(res.issueId);
  assert.equal(res.source, 'placeholder');
  assert.ok(res.url.startsWith('data:image/svg+xml'));
  const after = issuesMod.listAssetIssues().length;
  assert.equal(after, before + 1);
});

test('video type is explicitly unsupported (degraded, not faked success)', async () => {
  const res = await mod.resolveAsset({
    type: 'video',
    keywords: ['waves'],
    opts: { fetchImpl: throwingFetch },
  });
  assert.equal(res.degraded, true);
  assert.ok(res.issueId);
  assert.match(res.reason, /不支持联网检索此类型/);
});

test('validateAssetUrl judges whitelist membership', () => {
  assert.equal(mod.validateAssetUrl('https://images.unsplash.com/a.png').ok, true);
  assert.equal(mod.validateAssetUrl('https://api.iconify.design/mdi/home.svg').ok, true);
  const bad = mod.validateAssetUrl('https://evil.example.com/a.png');
  assert.equal(bad.ok, false);
  assert.equal(bad.reason, 'not_in_whitelist');
});

test('resolveAssets resolves a batch concurrently', async () => {
  const okFetch = async () => ({ status: 200, url: 'https://images.unsplash.com/b.png' });
  const results = await mod.resolveAssets([
    { type: 'image', keywords: ['ocean', 'sky'], opts: { fetchImpl: throwingFetch } }, // local
    { type: 'image', keywords: ['forest'], opts: { style: 'realistic', fetchImpl: okFetch } },
  ]);
  assert.equal(results.length, 2);
  assert.equal(results[0].source, 'local');
  assert.equal(results[1].degraded, false);
});
