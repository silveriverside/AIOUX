// 快照仓库：独立 git 管理每个节点的 HTML 版本历史
import { simpleGit } from 'simple-git';
import fs from 'node:fs';
import path from 'node:path';
import { SNAPSHOTS_DIR, PAGES_DIR } from './config.js';

let git;
let commitQueue = Promise.resolve();
let nextJobSeq = 1;
const snapshotJobs = new Map();

// 节点 HTML 文件路径
function nodeFile(nodeId) {
  return path.join(PAGES_DIR, `${nodeId}.html`);
}

// 初始化快照仓库（幂等）
export async function initSnapshots() {
  fs.mkdirSync(PAGES_DIR, { recursive: true });
  git = simpleGit(SNAPSHOTS_DIR);
  const isRepo = await git.checkIsRepo().catch(() => false);
  if (!isRepo) {
    await git.init();
    // 配置本地提交身份，避免全局缺失导致 commit 失败
    await git.addConfig('user.name', 'AIOUX');
    await git.addConfig('user.email', 'aioux@local');
  }
}

/**
 * 写入节点 HTML 并提交一个版本。
 * @returns {Promise<string>} 新提交的短 hash
 */
export async function commitNode(nodeId, html, message) {
  writeNodeHtml(nodeId, html);
  return commitNodeSnapshot(nodeId, message);
}

export function writeNodeHtml(nodeId, html) {
  fs.writeFileSync(nodeFile(nodeId), html, 'utf8');
}

async function commitNodeSnapshot(nodeId, message) {
  await git.add(`pages/${nodeId}.html`);
  // 写入 graph.json 也一并提交（由 graph 模块负责写文件，这里负责纳入提交）
  const graphRel = 'graph.json';
  if (fs.existsSync(path.join(SNAPSHOTS_DIR, graphRel))) {
    await git.add(graphRel);
  }
  const res = await git.commit(message || `update ${nodeId}`);
  return res.commit || await git.revparse(['HEAD']);
}

export function commitNodeAsync(nodeId, html, message) {
  const jobId = `snap_${Date.now()}_${nextJobSeq++}`;
  const startedAt = Date.now();
  snapshotJobs.set(jobId, {
    jobId,
    nodeId,
    status: 'pending',
    startedAt,
    finishedAt: null,
    elapsedMs: null,
    commit: '',
    error: null,
  });

  const promise = commitQueue.then(async () => {
    try {
      writeNodeHtml(nodeId, html);
      const commit = await commitNodeSnapshot(nodeId, message);
      const finishedAt = Date.now();
      const job = snapshotJobs.get(jobId);
      Object.assign(job, {
        status: 'done',
        finishedAt,
        elapsedMs: finishedAt - startedAt,
        commit,
      });
      console.log(`[snapshot] async commit done job=${jobId} node=${nodeId} commit=${commit.slice(0, 8)} elapsed=${job.elapsedMs}ms`);
      return commit;
    } catch (err) {
      const finishedAt = Date.now();
      const job = snapshotJobs.get(jobId);
      Object.assign(job, {
        status: 'failed',
        finishedAt,
        elapsedMs: finishedAt - startedAt,
        error: err.message,
      });
      console.error(`[snapshot] async commit failed job=${jobId} node=${nodeId}:`, err.message);
      throw err;
    }
  });
  commitQueue = promise.catch(() => {});
  return { jobId, promise };
}

export function getSnapshotJob(jobId) {
  return snapshotJobs.get(jobId) || null;
}

// 读取节点当前 HTML
export function getNodeHtml(nodeId) {
  const f = nodeFile(nodeId);
  if (!fs.existsSync(f)) return '';
  return fs.readFileSync(f, 'utf8');
}

// 列出某节点的版本历史
export async function listNodeHistory(nodeId) {
  const log = await git.log({ file: `pages/${nodeId}.html` }).catch(() => null);
  if (!log) return [];
  return log.all.map((c) => ({
    hash: c.hash.slice(0, 8),
    fullHash: c.hash,
    date: c.date,
    message: c.message,
  }));
}

// 把某节点回退到指定版本（用 checkout 该版本的文件内容，再提交为新版本）
export async function revertNode(nodeId, fullHash) {
  await git.checkout([fullHash, '--', `pages/${nodeId}.html`]);
  const html = getNodeHtml(nodeId);
  const res = await git.commit(`revert ${nodeId} to ${fullHash.slice(0, 8)}`, [`pages/${nodeId}.html`]);
  return { html, commit: res.commit || '' };
}
