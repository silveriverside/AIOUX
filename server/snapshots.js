// 快照仓库：独立 git 管理每个节点的 HTML 版本历史
import { simpleGit } from 'simple-git';
import fs from 'node:fs';
import path from 'node:path';
import { SNAPSHOTS_DIR, PAGES_DIR, GRAPH_FILE } from './config.js';

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

// 把一个异步任务串行链到全局提交队列，保证所有"写文件 + git 操作"互不并发。
// 返回该任务的 Promise；队列自身吞掉错误以免阻断后续任务。
function enqueue(task) {
  const result = commitQueue.then(task);
  commitQueue = result.catch(() => {});
  return result;
}

export function writeNodeHtml(nodeId, html) {
  fs.writeFileSync(nodeFile(nodeId), html, 'utf8');
}

/**
 * 写入节点 HTML 并提交一个版本（同步路径，已统一进串行队列）。
 * @returns {Promise<string>} 新提交的短/全 hash；无变更时返回 ''。
 */
export async function commitNode(nodeId, html, message) {
  return enqueue(async () => {
    writeNodeHtml(nodeId, html);
    return commitNodeSnapshot(nodeId, message);
  });
}

// 在串行队列内部执行：提交本节点 HTML + graph.json（显式 pathspec，避免带入 index 其它脏内容）。
// 提交前检查是否有实际变更；无变更则跳过 commit 直接返回 ''，避免 "nothing to commit" 报错。
async function commitNodeSnapshot(nodeId, message) {
  const pathspec = [`pages/${nodeId}.html`];
  if (fs.existsSync(GRAPH_FILE)) pathspec.push('graph.json');
  await git.add(pathspec);
  const status = await git.status(['--', ...pathspec]);
  if (!status.files.length) {
    // 无实际变更：不产生空提交，回读当前 HEAD 作为版本标识。
    return git.revparse(['HEAD']).catch(() => '');
  }
  const res = await git.commit(message || `update ${nodeId}`, pathspec);
  return res.commit || await git.revparse(['HEAD']);
}

/**
 * 异步提交节点快照：入队时即捕获图谱状态字符串，提交前写回，确保 HTML 版本与该次交互时刻的图谱一致。
 * @param {string} nodeId
 * @param {string} html
 * @param {string} message
 * @param {string|null} graphSnapshot 入队时刻的 graph.json 内容（由 graph.serialize() 提供）
 */
export function commitNodeAsync(nodeId, html, message, graphSnapshot = null) {
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

  const promise = enqueue(async () => {
    try {
      writeNodeHtml(nodeId, html);
      // 写回入队时刻捕获的图谱状态，避免提交到队列等待期间被后续交互改写的最新态（串版本）。
      if (typeof graphSnapshot === 'string') {
        fs.writeFileSync(GRAPH_FILE, graphSnapshot, 'utf8');
      }
      const commit = await commitNodeSnapshot(nodeId, message);
      const finishedAt = Date.now();
      const job = snapshotJobs.get(jobId);
      Object.assign(job, {
        status: 'done',
        finishedAt,
        elapsedMs: finishedAt - startedAt,
        commit,
      });
      console.log(`[snapshot] async commit done job=${jobId} node=${nodeId} commit=${(commit || '').slice(0, 8)} elapsed=${job.elapsedMs}ms`);
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

// 把某节点回退到指定版本（用 checkout 该版本的文件内容，再提交为新版本）。
// 统一进串行队列，避免与异步快照并发写同一文件；无变更时跳过空提交。
export async function revertNode(nodeId, fullHash) {
  return enqueue(async () => {
    await git.checkout([fullHash, '--', `pages/${nodeId}.html`]);
    const html = getNodeHtml(nodeId);
    const pathspec = [`pages/${nodeId}.html`];
    await git.add(pathspec);
    const status = await git.status(['--', ...pathspec]);
    if (!status.files.length) {
      const commit = await git.revparse(['HEAD']).catch(() => '');
      return { html, commit };
    }
    const res = await git.commit(`revert ${nodeId} to ${fullHash.slice(0, 8)}`, pathspec);
    return { html, commit: res.commit || '' };
  });
}
