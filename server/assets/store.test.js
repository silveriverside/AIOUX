import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aioux-assets-store-'));
process.env.AIOUX_ASSETS_DIR = tempRoot;

const store = await import(`./store.js?case=${Date.now()}`);

test.afterEach(() => {
  store.__resetStoreCacheForTest();
});

test.after(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test('makeCacheKey is stable regardless of keyword order/case', () => {
  const a = store.makeCacheKey({ type: 'image', keywords: ['Ocean', 'Sky'], sizeHint: '16x9' });
  const b = store.makeCacheKey({ type: 'image', keywords: ['sky', 'ocean '], sizeHint: '16x9' });
  assert.equal(a, b);
  const c = store.makeCacheKey({ type: 'icon', keywords: ['sky', 'ocean'], sizeHint: '16x9' });
  assert.notEqual(a, c);
});

test('findInLibrary scores keyword hits and returns best match', () => {
  const libDir = path.join(tempRoot, 'library');
  fs.mkdirSync(libDir, { recursive: true });
  fs.writeFileSync(
    path.join(libDir, 'index.json'),
    JSON.stringify([
      { id: 'a', type: 'image', path: 'library/a.png', tags: ['ocean'], title: 'sea' },
      { id: 'b', type: 'image', path: 'library/b.png', tags: ['ocean', 'sky', 'sunset'], title: 'ocean sky sunset' },
      { id: 'c', type: 'icon', path: 'library/c.svg', tags: ['ocean', 'sky'], title: '' },
    ]),
    'utf8'
  );
  const hit = store.findInLibrary({ type: 'image', keywords: ['ocean', 'sky', 'sunset'] });
  assert.equal(hit.id, 'b');
  const none = store.findInLibrary({ type: 'image', keywords: ['unrelated'] });
  assert.equal(none, null);
});

test('loadLibraryIndex reuses cache until file mtime changes, then refreshes', async () => {
  const libDir = path.join(tempRoot, 'library');
  fs.mkdirSync(libDir, { recursive: true });
  const file = path.join(libDir, 'index.json');
  fs.writeFileSync(file, JSON.stringify([{ id: 'a', type: 'image', title: 'first' }]), 'utf8');

  const first = store.loadLibraryIndex();
  const second = store.loadLibraryIndex();
  assert.equal(first, second, '未改文件时应复用同一缓存引用');

  // 等待 mtime 变化，再改文件，缓存应刷新。
  await new Promise((resolve) => setTimeout(resolve, 20));
  fs.writeFileSync(file, JSON.stringify([{ id: 'b', type: 'image', title: 'second' }]), 'utf8');
  const third = store.loadLibraryIndex();
  assert.notEqual(third, second, '文件变更后应刷新缓存');
  assert.equal(third[0].id, 'b');
});

test('putCached writes and getCached reads back', () => {
  const entry = store.putCached({
    cacheKey: 'image|ocean|',
    resolvedUrl: 'https://images.unsplash.com/x.png',
    source: 'unsplash',
    type: 'image',
    keywords: ['ocean'],
    status: 'ok',
  });
  assert.equal(entry.hits, 0);
  const got = store.getCached('image|ocean|');
  assert.equal(got.resolvedUrl, 'https://images.unsplash.com/x.png');
  assert.equal(got.status, 'ok');
});

test('putCached keeps multiple entries via in-memory merge instead of reloading disk each time', () => {
  store.putCached({
    cacheKey: 'image|ocean|',
    resolvedUrl: 'https://images.unsplash.com/ocean.png',
    source: 'unsplash',
    type: 'image',
  });
  store.putCached({
    cacheKey: 'image|sky|',
    resolvedUrl: 'https://images.unsplash.com/sky.png',
    source: 'unsplash',
    type: 'image',
  });
  const index = store.loadCacheIndex();
  assert.equal(index['image|ocean|'].resolvedUrl, 'https://images.unsplash.com/ocean.png');
  assert.equal(index['image|sky|'].resolvedUrl, 'https://images.unsplash.com/sky.png');
});

test('loadCacheIndex rebuilds (no throw) on corrupt JSON', () => {
  const cacheDir = path.join(tempRoot, 'cache');
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(path.join(cacheDir, 'index.json'), '{not valid json', 'utf8');
  const index = store.loadCacheIndex();
  assert.deepEqual(index, {});
  // 写入仍可工作
  store.putCached({ cacheKey: 'k', resolvedUrl: 'u', source: 's', type: 'image' });
  assert.equal(store.getCached('k').resolvedUrl, 'u');
});

test('loadLibraryIndex returns [] (no throw) on corrupt JSON', () => {
  fs.writeFileSync(path.join(tempRoot, 'library', 'index.json'), 'broken', 'utf8');
  assert.deepEqual(store.loadLibraryIndex(), []);
});
