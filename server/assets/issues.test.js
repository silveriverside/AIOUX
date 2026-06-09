import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aioux-assets-issues-'));
process.env.AIOUX_ASSETS_DIR = tempRoot;

const issues = await import(`./issues.js?case=${Date.now()}`);

test.after(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test('recordAssetIssue returns issueId and listAssetIssues reads it back', () => {
  const id = issues.recordAssetIssue({
    cacheKey: 'image|ocean|',
    keywords: ['ocean'],
    failedUrl: 'https://source.unsplash.com/1600x900/?ocean',
    reason: 'bad_status',
    fallbackUsed: true,
    traceId: 'trace-1',
  });
  assert.match(id, /^issue_\d+_[a-z0-9]+$/);

  const all = issues.listAssetIssues();
  assert.equal(all.length, 1);
  assert.equal(all[0].issueId, id);
  assert.equal(all[0].reason, 'bad_status');
  assert.equal(all[0].resolved, false);
  assert.equal(all[0].fallbackUsed, true);
});

test('listAssetIssues filters by since and skips corrupt lines', () => {
  const file = path.join(tempRoot, 'issues.jsonl');
  // 追加一条损坏行
  fs.appendFileSync(file, 'NOT JSON\n', 'utf8');
  const id2 = issues.recordAssetIssue({ reason: 'timeout' });
  assert.ok(id2);

  const all = issues.listAssetIssues();
  // 损坏行被跳过，仅保留 2 条有效记录
  assert.equal(all.length, 2);

  const future = issues.listAssetIssues({ since: Date.now() + 100000 });
  assert.equal(future.length, 0);
});

test('listAssetIssues returns [] when file missing', () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'aioux-issues-empty-'));
  process.env.AIOUX_ASSETS_DIR = empty;
  // 重新导入以使用新目录
  // 直接检查当前文件不存在场景：删除已有文件
  fs.rmSync(path.join(tempRoot, 'issues.jsonl'), { force: true });
  assert.deepEqual(issues.listAssetIssues(), []);
  fs.rmSync(empty, { recursive: true, force: true });
  process.env.AIOUX_ASSETS_DIR = tempRoot;
});
