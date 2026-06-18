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

  // 第 9 轮扩充：热点 target 的跨场景近邻样本
  { description: '点击带 targetLabel 的 2D 地图热点', category: 'hotspot_target', ev: { type: 'tap', targetLabel: '广州塔' }, caps: { sceneType: 'interactive_2d', nativeInteractions: NATIVE['2d'] }, expected: { kind: 'model', intentHint: 'create_or_navigate' } },
  { description: '点击带 targetLabel 的卡片条目', category: 'hotspot_target', ev: { type: 'tap', targetLabel: '火星任务卡片' }, caps: { sceneType: 'card_browser', nativeInteractions: NATIVE.card }, expected: { kind: 'model', intentHint: 'create_or_navigate' } },
  { description: '沉浸页点击带 targetLabel 的故事节点', category: 'hotspot_target', ev: { type: 'tap', targetLabel: '第二章' }, caps: { sceneType: 'immersive_media', nativeInteractions: NATIVE.imm }, expected: { kind: 'model', intentHint: 'create_or_navigate' } },

  // 第 9 轮扩充：文本本地控制词边界
  { description: '文本“缩小一点”在 2D', category: 'text_local_control', ev: { type: 'text', text: '缩小一点' }, caps: { sceneType: 'interactive_2d', nativeInteractions: NATIVE['2d'] }, expected: { kind: 'local_native', intentHint: 'local_native' } },
  { description: '文本“拖动一下”在 3D', category: 'text_local_control', ev: { type: 'text', text: '拖动一下' }, caps: { sceneType: 'interactive_3d', nativeInteractions: NATIVE['3d'] }, expected: { kind: 'local_native', intentHint: 'local_native' } },
  { description: '文本“滑动一下”在卡片页', category: 'text_local_control', ev: { type: 'text', text: '滑动一下' }, caps: { sceneType: 'card_browser', nativeInteractions: NATIVE.card }, expected: { kind: 'local_native', intentHint: 'local_native' } },

  // 第 9 轮扩充：明确当前页/当前区域的细化表达
  { description: '文本“给当前页加一层热力图”', category: 'text_refine', ev: { type: 'text', text: '给当前页加一层热力图' }, caps: { sceneType: 'interactive_2d', nativeInteractions: NATIVE['2d'] }, expected: { kind: 'model', intentHint: 'refine_current' } },
  { description: '文本“把这个场景改成夜间风格”', category: 'text_refine', ev: { type: 'text', text: '把这个场景改成夜间风格' }, caps: { sceneType: 'immersive_media', nativeInteractions: NATIVE.imm }, expected: { kind: 'model', intentHint: 'refine_current' } },
  { description: '文本“只看这里的重点区域”', category: 'text_refine', ev: { type: 'text', text: '只看这里的重点区域' }, caps: { sceneType: 'interactive_2d', nativeInteractions: NATIVE['2d'] }, expected: { kind: 'model', intentHint: 'refine_current' } },
  { description: '文本“在当前图上隐藏次要标签”', category: 'text_refine', ev: { type: 'text', text: '在当前图上隐藏次要标签' }, caps: { sceneType: 'interactive_2d', nativeInteractions: NATIVE['2d'] }, expected: { kind: 'model', intentHint: 'refine_current' } },

  // 第 9 轮扩充：新主题/导航表达
  { description: '文本“打开火星基地页面”', category: 'text_create', ev: { type: 'text', text: '打开火星基地页面' }, caps: { sceneType: 'card_browser', nativeInteractions: NATIVE.card }, expected: { kind: 'model', intentHint: 'create_or_navigate' } },
  { description: '文本“切到深圳湾专题”', category: 'text_create', ev: { type: 'text', text: '切到深圳湾专题' }, caps: { sceneType: 'interactive_2d', nativeInteractions: NATIVE['2d'] }, expected: { kind: 'model', intentHint: 'create_or_navigate' } },
  { description: '文本“展开看看这个星系”', category: 'text_create', ev: { type: 'text', text: '展开看看这个星系' }, caps: { sceneType: 'interactive_3d', nativeInteractions: NATIVE['3d'] }, expected: { kind: 'model', intentHint: 'create_or_navigate' } },
  { description: '文本“做一个城市夜景封面”', category: 'text_create', ev: { type: 'text', text: '做一个城市夜景封面' }, caps: { sceneType: 'generic', nativeInteractions: NATIVE.none }, expected: { kind: 'model', intentHint: 'create_or_navigate' } },

  // 第 9 轮扩充：generic 非文本无 target 的兜底
  { description: 'generic 滑动无 target', category: 'generic_tap', ev: { type: 'swipe' }, caps: { sceneType: 'generic', nativeInteractions: NATIVE.none }, expected: { kind: 'model', intentHint: 'refine_current' } },
  { description: 'generic 缩放无 target', category: 'generic_tap', ev: { type: 'pinch' }, caps: { sceneType: 'generic', nativeInteractions: NATIVE.none }, expected: { kind: 'model', intentHint: 'refine_current' } },

  // 第 9 轮扩充：generic 模糊文本继续交给模型判断
  { description: 'generic 文本“这个怎么样”', category: 'generic_text_fallback', ev: { type: 'text', text: '这个怎么样' }, caps: { sceneType: 'generic', nativeInteractions: NATIVE.none }, expected: { kind: 'model', intentHint: 'model_decide' } },
  { description: 'generic 文本“还有别的吗”', category: 'generic_text_fallback', ev: { type: 'text', text: '还有别的吗' }, caps: { sceneType: 'generic', nativeInteractions: NATIVE.none }, expected: { kind: 'model', intentHint: 'model_decide' } },

  // 边缘：nativeInteractions 缺失不应崩溃
  { description: 'caps.nativeInteractions 缺失（3D tap 不命中本地）', category: 'edge_missing_caps', ev: { type: 'tap' }, caps: { sceneType: 'interactive_3d' }, expected: { kind: 'model', intentHint: 'refine_current' } },
  { description: 'caps 缺失时文本创建仍可路由', category: 'edge_missing_caps', ev: { type: 'text', text: '新建一个太阳系页面' }, caps: null, expected: { kind: 'model', intentHint: 'create_or_navigate' } },
  { description: 'caps 缺失时模糊文本走模型判断', category: 'edge_missing_caps', ev: { type: 'text', text: '帮我看看' }, caps: null, expected: { kind: 'model', intentHint: 'model_decide' } },
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
