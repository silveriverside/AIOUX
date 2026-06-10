import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aioux-memory-store-'));
process.env.AIOUX_SNAPSHOTS_DIR = tempRoot;

const store = await import(`./memoryStore.js?case=${Date.now()}`);
const config = await import(`./config.js?case=${Date.now()}`);

test.after(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test('memoryStore 使用 config.MEMORY_FILE 作为唯一路径来源', () => {
  assert.equal(store.resolveMemoryFile(), config.MEMORY_FILE);
  assert.equal(store.resolveMemoryFile(), path.join(tempRoot, 'memory.json'));
});

test('冷启动文件不存在返回默认结构', () => {
  const mem = store.loadMemoryFile();
  assert.equal(mem.version, 1);
  assert.deepEqual(mem.pages, {});
  assert.deepEqual(mem.assets, {});
  assert.equal(mem.preferences.totalSignals, 0);
  assert.ok(Array.isArray(mem.events));
});

test('损坏 JSON 重建不抛错', () => {
  const file = store.resolveMemoryFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '{ this is not valid json', 'utf8');
  let mem;
  assert.doesNotThrow(() => {
    mem = store.loadMemoryFile();
  });
  assert.equal(mem.version, 1);
  assert.deepEqual(mem.pages, {});
});

test('写后读一致', () => {
  const mem = store.createEmptyMemory();
  mem.pages.foo = { nodeId: 'foo', useCount: 3 };
  mem.preferences.totalSignals = 7;
  store.writeMemoryFile(mem);
  const back = store.loadMemoryFile();
  assert.equal(back.pages.foo.useCount, 3);
  assert.equal(back.preferences.totalSignals, 7);
});
