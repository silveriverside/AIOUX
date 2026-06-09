import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aioux-snapshots-'));
process.env.AIOUX_SNAPSHOTS_DIR = tempRoot;

const snapshots = await import(`./snapshots.js?case=${Date.now()}`);

test.after(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test('serializes async snapshot writes with their matching git commits', async () => {
  await snapshots.initSnapshots();

  const firstHtml = '<main id="race-node"><p>first version</p></main>';
  const secondHtml = '<main id="race-node"><p>second version</p></main>';

  const first = snapshots.commitNodeAsync('race_node', firstHtml, 'first async version');
  const second = snapshots.commitNodeAsync('race_node', secondHtml, 'second async version');
  const results = await Promise.allSettled([first.promise, second.promise]);

  assert.deepEqual(
    results.map((result) => result.status),
    ['fulfilled', 'fulfilled'],
    results.map((result) => result.reason?.message || '').join('\n')
  );

  const history = await snapshots.listNodeHistory('race_node');
  assert.equal(history.length, 2);
  assert.equal(history[0].message, 'second async version');
  assert.equal(history[1].message, 'first async version');
  assert.equal(snapshots.getNodeHtml('race_node'), secondHtml);
  assert.equal(snapshots.getSnapshotJob(first.jobId).status, 'done');
  assert.equal(snapshots.getSnapshotJob(second.jobId).status, 'done');
});

test('pins the graph snapshot captured at enqueue time (no cross-version)', async () => {
  await snapshots.initSnapshots();
  const graphFile = path.join(tempRoot, 'graph.json');

  // 入队两次：各自携带"入队时刻"的不同图谱状态。
  const graphA = JSON.stringify({ nodes: { main: {} }, current: 'node_a' }, null, 2);
  const graphB = JSON.stringify({ nodes: { main: {} }, current: 'node_b' }, null, 2);
  const a = snapshots.commitNodeAsync('pin_node', '<main>A</main>', 'version A', graphA);
  const b = snapshots.commitNodeAsync('pin_node', '<main>B</main>', 'version B', graphB);
  await Promise.allSettled([a.promise, b.promise]);

  // 队列串行执行后，磁盘 graph.json 应等于最后一个 job 携带的快照（graphB），而非中途被串改。
  assert.equal(fs.readFileSync(graphFile, 'utf8'), graphB);
});

test('revert without actual change does not throw on empty commit', async () => {
  await snapshots.initSnapshots();
  await snapshots.commitNode('revert_node', '<main>v1</main>', 'v1');
  const history = await snapshots.listNodeHistory('revert_node');
  const firstHash = history[history.length - 1].fullHash;

  // 回退到当前唯一版本（内容相同）：应安全返回，不因 "nothing to commit" 抛错。
  const result = await snapshots.revertNode('revert_node', firstHash);
  assert.equal(result.html, '<main>v1</main>');
  assert.ok(typeof result.commit === 'string');
});
