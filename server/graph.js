// 页面图谱：节点与关系的持久化（graph.json），独立于 HTML 内容
import fs from 'node:fs';
import { GRAPH_FILE } from './config.js';

// 内存中的图谱状态
let graph = {
  nodes: {}, // nodeId -> { nodeId, title, parentId, intent, createdAt }
  current: 'main', // 当前所在节点
};

const ROOT = {
  nodeId: 'main',
  title: '主页',
  parentId: null,
  intent: '初始空白欢迎页',
  createdAt: Date.now(),
};

export function initGraph() {
  if (fs.existsSync(GRAPH_FILE)) {
    try {
      graph = JSON.parse(fs.readFileSync(GRAPH_FILE, 'utf8'));
    } catch {
      // 文件损坏时重建（记录而非静默：打印告警）
      console.warn('[graph] graph.json 解析失败，重建图谱');
      resetGraph();
    }
  } else {
    resetGraph();
  }
  if (!graph.nodes.main) {
    graph.nodes.main = { ...ROOT };
  }
}

function resetGraph() {
  graph = { nodes: { main: { ...ROOT } }, current: 'main' };
  persist();
}

function persist() {
  fs.writeFileSync(GRAPH_FILE, JSON.stringify(graph, null, 2), 'utf8');
}

export function getNode(nodeId) {
  return graph.nodes[nodeId] || null;
}

export function hasNode(nodeId) {
  return Boolean(graph.nodes[nodeId]);
}

// 新增或更新节点（create 用）
export function addNode({ nodeId, title, parentId, intent }) {
  if (!graph.nodes[nodeId]) {
    graph.nodes[nodeId] = {
      nodeId,
      title: title || nodeId,
      parentId: parentId && graph.nodes[parentId] ? parentId : 'main',
      intent: intent || '',
      createdAt: Date.now(),
    };
  } else {
    // 已存在则更新标题/意图
    graph.nodes[nodeId].title = title || graph.nodes[nodeId].title;
  }
  persist();
  return graph.nodes[nodeId];
}

export function setCurrent(nodeId) {
  if (graph.nodes[nodeId]) {
    graph.current = nodeId;
    persist();
  }
}

export function getCurrent() {
  return graph.current;
}

// 精简的节点列表，供模型判断 navigate 目标
export function listNodes() {
  return Object.values(graph.nodes).map((n) => ({
    nodeId: n.nodeId,
    title: n.title,
    parentId: n.parentId,
  }));
}

// 完整图谱（前端导航树用）
export function getGraph() {
  return { nodes: graph.nodes, current: graph.current };
}

// 从 main 到指定节点的面包屑路径
export function getBreadcrumb(nodeId) {
  const path = [];
  let cur = graph.nodes[nodeId];
  const guard = new Set();
  while (cur && !guard.has(cur.nodeId)) {
    guard.add(cur.nodeId);
    path.unshift({ nodeId: cur.nodeId, title: cur.title });
    cur = cur.parentId ? graph.nodes[cur.parentId] : null;
  }
  return path;
}
