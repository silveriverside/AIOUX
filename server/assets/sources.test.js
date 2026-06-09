import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildText2ImageUrl,
  buildUnsplashKeywordUrl,
  buildIconUrl,
  probeAssetUrl,
} from './sources.js';

test('buildText2ImageUrl encodes prompt and uses default size', () => {
  const url = buildText2ImageUrl('a cat on roof');
  assert.ok(url.startsWith('https://copilot-cn.bytedance.net/api/ide/v1/text_to_image?prompt='));
  assert.ok(url.includes('prompt=a%20cat%20on%20roof'));
  assert.ok(url.endsWith('&image_size=landscape_16_9'));
});

test('buildText2ImageUrl falls back to landscape_16_9 for invalid size', () => {
  const url = buildText2ImageUrl('x', { imageSize: 'not_a_size' });
  assert.ok(url.endsWith('&image_size=landscape_16_9'));
  const ok = buildText2ImageUrl('x', { imageSize: 'portrait_16_9' });
  assert.ok(ok.endsWith('&image_size=portrait_16_9'));
});

test('buildUnsplashKeywordUrl joins and encodes keywords', () => {
  const url = buildUnsplashKeywordUrl(['blue sky', 'ocean']);
  assert.equal(url, 'https://source.unsplash.com/1600x900/?blue%20sky,ocean');
});

test('buildIconUrl uses iconify with set and name', () => {
  assert.equal(buildIconUrl('home'), 'https://api.iconify.design/mdi/home.svg');
  assert.equal(buildIconUrl('star', { set: 'lucide' }), 'https://api.iconify.design/lucide/star.svg');
});

test('probeAssetUrl returns ok with finalUrl on 2xx', async () => {
  const fetchImpl = async () => ({ status: 200, url: 'https://example.com/final.png' });
  const res = await probeAssetUrl('https://example.com/a.png', { fetchImpl });
  assert.equal(res.ok, true);
  assert.equal(res.status, 200);
  assert.equal(res.finalUrl, 'https://example.com/final.png');
  assert.equal(res.reason, 'ok');
});

test('probeAssetUrl reports bad_status on non-2xx (HEAD and GET both 404)', async () => {
  const fetchImpl = async () => ({ status: 404, url: 'https://example.com/a.png' });
  const res = await probeAssetUrl('https://example.com/a.png', { fetchImpl });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'bad_status');
});

test('probeAssetUrl falls back to GET when HEAD fails but GET ok', async () => {
  let calls = 0;
  const fetchImpl = async (_url, { method }) => {
    calls += 1;
    if (method === 'HEAD') return { status: 405, url: 'https://example.com/a.png' };
    return { status: 200, url: 'https://example.com/a.png' };
  };
  const res = await probeAssetUrl('https://example.com/a.png', { fetchImpl });
  assert.equal(calls, 2);
  assert.equal(res.ok, true);
});

test('probeAssetUrl reports timeout when fetch aborts', async () => {
  const fetchImpl = (_url, { signal }) =>
    new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        reject(err);
      });
    });
  const res = await probeAssetUrl('https://example.com/slow.png', {
    fetchImpl,
    timeoutMs: 10,
  });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'timeout');
});

test('probeAssetUrl reports network_error on thrown non-abort error', async () => {
  const fetchImpl = async () => {
    throw new Error('ECONNREFUSED');
  };
  const res = await probeAssetUrl('https://example.com/a.png', { fetchImpl });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'network_error');
});
