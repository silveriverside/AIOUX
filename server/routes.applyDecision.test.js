import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// 隔离快照目录，避免污染真实 snapshots/。必须在 import 业务模块前设置。
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aioux-routes-'));
process.env.AIOUX_SNAPSHOTS_DIR = tempRoot;

// 必须用无 query 的 import，保证与 routes.js 内部 import 的 graph/snapshots 是同一单例实例。
const graph = await import('./graph.js');
const snap = await import('./snapshots.js');
const { applyDecision } = await import('./routes.js');

test.before(async () => {
  await snap.initSnapshots();
  graph.initGraph();
});

test.after(async () => {
  // 等待异步快照队列排空后再清理临时目录，避免后台 job 在目录被删后报错。
  await new Promise((resolve) => setTimeout(resolve, 300));
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

const main = { nodeId: 'main', title: '主页', html: '' };

test('P1-4: navigate 到不存在的节点返回 applied:false 且不跳转', () => {
  const before = graph.getCurrent();
  const result = applyDecision(
    { action: 'navigate', nodeId: 'no_such_node', title: 'x', intent: 'x', mode: 'full', html: '', patches: [] },
    main
  );
  assert.equal(result.applied, false, '不存在的导航目标不应被报告为已应用');
  assert.ok(result.navWarning && result.navWarning.includes('no_such_node'));
  assert.equal(graph.getCurrent(), before, 'current 不应被改变');
});

test('P1-2: create 命中已存在 nodeId 时去重，不覆盖既有节点', () => {
  // 先创建一个节点。
  applyDecision(
    { action: 'create', nodeId: 'dup_page', parentId: 'main', title: '原始页', intent: '首次创建', mode: 'full', html: '<div>v1</div>', patches: [] },
    main
  );
  assert.ok(graph.hasNode('dup_page'));

  // 再次 create 相同 nodeId：应去重为 dup_page_2，原节点保留。
  const decision = { action: 'create', nodeId: 'dup_page', parentId: 'main', title: '第二个同名页', intent: '再次创建', mode: 'full', html: '<div>v2</div>', patches: [] };
  const result = applyDecision(decision, main);

  assert.equal(decision.nodeId, 'dup_page_2', 'nodeId 应被去重');
  assert.equal(result.nodeId, 'dup_page_2');
  assert.ok(graph.hasNode('dup_page_2'), '去重后的新节点应存在');
  assert.equal(graph.getNode('dup_page').title, '原始页', '原节点标题不应被覆盖');
});
