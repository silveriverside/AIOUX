// 图谱导航面板：面包屑、节点树、版本列表
import { api } from './api.js';

let onNavigate = () => {};
let onRevert = () => {};

export function initGraphPanel(handlers) {
  onNavigate = handlers.onNavigate || onNavigate;
  onRevert = handlers.onRevert || onRevert;
}

// 渲染面包屑
export function renderBreadcrumb(breadcrumb) {
  const el = document.getElementById('breadcrumb');
  el.innerHTML = '';
  (breadcrumb || []).forEach((crumb, i) => {
    if (i > 0) {
      const sep = document.createElement('span');
      sep.className = 'sep'; sep.textContent = '›';
      el.appendChild(sep);
    }
    const c = document.createElement('span');
    c.className = 'crumb' + (i === breadcrumb.length - 1 ? ' active' : '');
    c.textContent = crumb.title;
    c.onclick = () => onNavigate(crumb.nodeId);
    el.appendChild(c);
  });
}

// 渲染节点树（按 parentId 组织缩进）
export function renderTree(graph) {
  const el = document.getElementById('graph-tree');
  el.innerHTML = '';
  const nodes = Object.values(graph.nodes || {});
  const childrenOf = (pid) => nodes.filter((n) => n.parentId === pid);

  function walk(node, depth) {
    const item = document.createElement('div');
    item.className = 'tree-node' + (node.nodeId === graph.current ? ' current' : '');
    item.style.paddingLeft = `${8 + depth * 14}px`;
    item.innerHTML = `<span class="dot"></span><span>${escapeHtml(node.title)}</span>`;
    item.onclick = () => onNavigate(node.nodeId);
    el.appendChild(item);
    childrenOf(node.nodeId).forEach((c) => walk(c, depth + 1));
  }
  const root = graph.nodes?.main;
  if (root) walk(root, 0);
  // 渲染孤儿节点（parentId 不在图中）
  nodes.filter((n) => n.parentId && !graph.nodes[n.parentId] && n.nodeId !== 'main')
    .forEach((n) => walk(n, 0));
}

// 渲染当前节点的版本列表
export async function renderVersions(nodeId) {
  const el = document.getElementById('version-list');
  el.innerHTML = '<div class="version-item">加载中…</div>';
  try {
    const { history } = await api.history(nodeId);
    el.innerHTML = '';
    if (!history.length) { el.innerHTML = '<div class="version-item">暂无版本</div>'; return; }
    history.forEach((v, i) => {
      const item = document.createElement('div');
      item.className = 'version-item';
      const tag = i === 0 ? '最新' : `v${history.length - i}`;
      item.innerHTML = `<span class="h">${v.hash}</span> ${tag} · ${escapeHtml(v.message.slice(0, 28))}`;
      item.title = '点击回退到此版本';
      item.onclick = () => onRevert(nodeId, v.fullHash);
      el.appendChild(item);
    });
  } catch (err) {
    el.innerHTML = `<div class="version-item">版本读取失败: ${escapeHtml(err.message)}</div>`;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
