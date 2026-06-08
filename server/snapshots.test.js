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
