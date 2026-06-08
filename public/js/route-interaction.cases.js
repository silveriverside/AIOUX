// 意图路由评测集（可回放、无 DOM/网络/模型依赖）。
// 每条样本：description / category / ev / caps / expected。
// category 用于误判按边界类别汇总。

export const NATIVE = {
  '3d': ['drag_rotate', 'mousemove_parallax', 'deviceorientation', 'tap_background', 'swipe', 'pinch'],
  '2d': ['pan', 'zoom', 'swipe', 'select_rect', 'select_lasso', 'tap_background'],
  card: ['tap_filter', 'tap_sort', 'scroll_browse', 'tap_background'],
  imm: ['mousemove_parallax', 'scroll_story', 'tap_background'],
  none: [],
};

export const cases = [
  // 边界 1：3D 背景手势 → local_native
  { description: '3D 背景点击（tap_background）', category: '3d_background', ev: { type: 'tap' }, caps: { sceneType: 'interactive_3d', nativeInteractions: NATIVE['3d'] }, expected: { kind: 'local_native', intentHint: 'local_native' } },
  { description: '3D 背景滑动（swipe）', category: '3d_background', ev: { type: 'swipe' }, caps: { sceneType: 'interactive_3d', nativeInteractions: NATIVE['3d'] }, expected: { kind: 'local_native', intentHint: 'local_native' } },
  { description: '3D 背景缩放（pinch）', category: '3d_background', ev: { type: 'pinch' }, caps: { sceneType: 'interactive_3d', nativeInteractions: NATIVE['3d'] }, expected: { kind: 'local_native', intentHint: 'local_native' } },
  { description: '3D 长按（drag_rotate）', category: '3d_background', ev: { type: 'longpress' }, caps: { sceneType: 'interactive_3d', nativeInteractions: NATIVE['3d'] }, expected: { kind: 'local_native', intentHint: 'local_native' } },

  // 边界 2：带 targetLabel 的可探索热点 → model + create_or_navigate
  { description: '点击带 targetLabel 的 3D 热点', category: 'hotspot_target', ev: { type: 'tap', targetLabel: '木星' }, caps: { sceneType: 'interactive_3d', nativeInteractions: NATIVE['3d'] }, expected: { kind: 'model', intentHint: 'create_or_navigate' } },

  // 边界 3：2D 原生交互命中 → local_native
  { description: '2D 平移（swipe∈pan）', category: '2d_native', ev: { type: 'swipe' }, caps: { sceneType: 'interactive_2d', nativeInteractions: NATIVE['2d'] }, expected: { kind: 'local_native', intentHint: 'local_native' } },
  { description: '2D 缩放（pinch∈zoom）', category: '2d_native', ev: { type: 'pinch' }, caps: { sceneType: 'interactive_2d', nativeInteractions: NATIVE['2d'] }, expected: { kind: 'local_native', intentHint: 'local_native' } },
  { description: '2D 框选（select-rect）', category: '2d_native', ev: { type: 'select-rect' }, caps: { sceneType: 'interactive_2d', nativeInteractions: NATIVE['2d'] }, expected: { kind: 'local_native', intentHint: 'local_native' } },
  { description: '2D 圈选（select-lasso）', category: '2d_native', ev: { type: 'select-lasso' }, caps: { sceneType: 'interactive_2d', nativeInteractions: NATIVE['2d'] }, expected: { kind: 'local_native', intentHint: 'local_native' } },
  { description: '2D 背景点击（tap_background）', category: '2d_native', ev: { type: 'tap' }, caps: { sceneType: 'interactive_2d', nativeInteractions: NATIVE['2d'] }, expected: { kind: 'local_native', intentHint: 'local_native' } },

  // 边界 4：卡片/沉浸 tap/swipe → local_native
  { description: '卡片页点击', category: 'card_immersive', ev: { type: 'tap' }, caps: { sceneType: 'card_browser', nativeInteractions: NATIVE.card }, expected: { kind: 'local_native', intentHint: 'local_native' } },
  { description: '沉浸场景滑动', category: 'card_immersive', ev: { type: 'swipe' }, caps: { sceneType: 'immersive_media', nativeInteractions: NATIVE.imm }, expected: { kind: 'local_native', intentHint: 'local_native' } },

  // 边界 5：文本本地控制词且非 generic → local_native
  { description: '文本“放大一点”在 3D', category: 'text_local_control', ev: { type: 'text', text: '放大一点' }, caps: { sceneType: 'interactive_3d', nativeInteractions: NATIVE['3d'] }, expected: { kind: 'local_native', intentHint: 'local_native' } },
  { description: '文本“转一下”在 2D', category: 'text_local_control', ev: { type: 'text', text: '转一下' }, caps: { sceneType: 'interactive_2d', nativeInteractions: NATIVE['2d'] }, expected: { kind: 'local_native', intentHint: 'local_native' } },

  // 边界 6：文本细化词 → model + refine_current
  { description: '文本“聚焦当前这页”', category: 'text_refine', ev: { type: 'text', text: '聚焦当前这页' }, caps: { sceneType: 'interactive_2d', nativeInteractions: NATIVE['2d'] }, expected: { kind: 'model', intentHint: 'refine_current' } },
  { description: '文本“高亮显示重点”', category: 'text_refine', ev: { type: 'text', text: '高亮显示重点' }, caps: { sceneType: 'interactive_2d', nativeInteractions: NATIVE['2d'] }, expected: { kind: 'model', intentHint: 'refine_current' } },

  // 边界 7：文本创建词 → model + create_or_navigate
  { description: '文本“新建一个详情页”', category: 'text_create', ev: { type: 'text', text: '新建一个详情页' }, caps: { sceneType: 'interactive_2d', nativeInteractions: NATIVE['2d'] }, expected: { kind: 'model', intentHint: 'create_or_navigate' } },
  { description: '文本“进入这个专题深入看看”', category: 'text_create', ev: { type: 'text', text: '进入这个专题深入看看' }, caps: { sceneType: 'card_browser', nativeInteractions: NATIVE.card }, expected: { kind: 'model', intentHint: 'create_or_navigate' } },

  // 边界 8：generic 普通 tap（无 target）→ model + refine_current
  { description: 'generic 普通点击无 target', category: 'generic_tap', ev: { type: 'tap' }, caps: { sceneType: 'generic', nativeInteractions: NATIVE.none }, expected: { kind: 'model', intentHint: 'refine_current' } },

  // 补充：generic 模糊文本无信号 → model_decide
  { description: 'generic 模糊文本兜底', category: 'generic_text_fallback', ev: { type: 'text', text: '帮我看看' }, caps: { sceneType: 'generic', nativeInteractions: NATIVE.none }, expected: { kind: 'model', intentHint: 'model_decide' } },

  // 边缘：create + refine 同句 → create 优先
  { description: '文本“新建并高亮”（create 优先于 refine）', category: 'text_create', ev: { type: 'text', text: '新建并高亮' }, caps: { sceneType: 'interactive_2d', nativeInteractions: NATIVE['2d'] }, expected: { kind: 'model', intentHint: 'create_or_navigate' } },

  // 边缘：nativeInteractions 缺失不应崩溃
  { description: 'caps.nativeInteractions 缺失（3D tap 不命中本地）', category: 'edge_missing_caps', ev: { type: 'tap' }, caps: { sceneType: 'interactive_3d' }, expected: { kind: 'model', intentHint: 'refine_current' } },
];

export function summarizeMisroutings(allCases, failures) {
  const total = {};
  for (const c of allCases) total[c.category] = (total[c.category] || 0) + 1;
  const failBy = {};
  for (const f of failures) failBy[f.category] = (failBy[f.category] || 0) + 1;
  return Object.keys(total).map((cat) => ({
    category: cat,
    total: total[cat],
    passed: total[cat] - (failBy[cat] || 0),
    failed: failBy[cat] || 0,
  }));
}
