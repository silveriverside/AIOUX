// route-interaction.js — 交互意图路由纯函数（无 DOM / 无网络 / 无模型依赖，可单测回放）。
//
// 从 main.js 抽出，签名改为接收 caps 入参（原先依赖 stage.getCapabilities()），
// 逻辑保持与原实现一致，便于建立可回放的意图路由评测集。

export function routeInteraction(ev, caps) {
  const nativeSet = new Set(caps?.nativeInteractions || []);
  const sceneType = caps?.sceneType || 'generic';
  const noTarget = !ev.targetLabel;
  const text = (ev.text || '').trim();

  if (ev.type !== 'text') {
    if (noTarget && shouldHandleLocally(ev, sceneType, nativeSet)) {
      return {
        kind: 'local_native',
        message: localInteractionMessage(ev, sceneType),
        intentHint: 'local_native',
      };
    }
    return {
      kind: 'model',
      intentHint: ev.targetLabel ? 'create_or_navigate' : 'refine_current',
    };
  }

  if (text) {
    const lowered = text.toLowerCase();
    const explicitCurrentSignals = ['当前', '这页', '这个页面', '这个场景', '这个图', '这里', '在这', '在当前', '给当前'];
    const refineSignals = ['加上', '增加', '补充', '细化', '改成', '换成', '只看', '聚焦', '高亮', '显示', '隐藏', '调整', '改一下', '优化', '丰富', '加一层', '叠加'];
    const createSignals = ['新建', '生成一个', '做一个', '打开', '进入', '详情', '专题', '页面', '子页', '展开看看', '深入', '跳到', '切到'];
    const localTextSignals = ['旋转', '拖动', '拖拽', '滑动一下', '放大一点', '缩小一点', '转一下'];
    const hasExplicitCurrent = explicitCurrentSignals.some((w) => text.includes(w));
    const hasLocalText = localTextSignals.some((w) => text.includes(w) || lowered.includes(w));
    const hasCreate = createSignals.some((w) => text.includes(w) || lowered.includes(w));
    const hasRefine = refineSignals.some((w) => text.includes(w) || lowered.includes(w));
    if (hasLocalText && sceneType !== 'generic' && !hasCreate && !hasRefine) {
      return {
        kind: 'local_native',
        message: localInteractionMessage({ type: 'text-native' }, sceneType),
        intentHint: 'local_native',
      };
    }
    if (hasExplicitCurrent || (hasRefine && !hasCreate)) return { kind: 'model', intentHint: 'refine_current' };
    if (hasCreate) return { kind: 'model', intentHint: 'create_or_navigate' };
  }

  return { kind: 'model', intentHint: sceneType === 'generic' ? 'model_decide' : 'refine_current' };
}

export function shouldHandleLocally(ev, sceneType, nativeSet) {
  if (sceneType === 'interactive_3d') {
    return (
      (ev.type === 'swipe' && nativeSet.has('swipe')) ||
      (ev.type === 'tap' && nativeSet.has('tap_background')) ||
      (ev.type === 'longpress' && nativeSet.has('drag_rotate')) ||
      (ev.type === 'pinch' && nativeSet.has('pinch'))
    );
  }
  if (sceneType === 'interactive_2d') {
    return (
      (ev.type === 'swipe' && (nativeSet.has('pan') || nativeSet.has('swipe'))) ||
      (ev.type === 'pinch' && nativeSet.has('zoom')) ||
      (ev.type === 'select-rect' && nativeSet.has('select_rect')) ||
      (ev.type === 'select-lasso' && nativeSet.has('select_lasso')) ||
      (ev.type === 'tap' && nativeSet.has('tap_background'))
    );
  }
  if (sceneType === 'card_browser') {
    return ev.type === 'tap' || ev.type === 'swipe';
  }
  if (sceneType === 'immersive_media') {
    return ev.type === 'tap' || ev.type === 'swipe';
  }
  return false;
}

export function localInteractionMessage(ev, sceneType) {
  if (sceneType === 'interactive_3d') return `当前 3D 场景已原生处理 ${labelForEvent(ev.type)}，未触发重新生成`;
  if (sceneType === 'interactive_2d') return `当前 2D 可视化已原生处理 ${labelForEvent(ev.type)}，未触发重新生成`;
  if (sceneType === 'card_browser') return `当前卡片页已原生处理 ${labelForEvent(ev.type)}，未触发重新生成`;
  if (sceneType === 'immersive_media') return `当前沉浸场景已原生处理 ${labelForEvent(ev.type)}，未触发重新生成`;
  return `当前页面已原生处理 ${labelForEvent(ev.type)}，未触发重新生成`;
}

export function labelForEvent(type) {
  return {
    tap: '点击',
    swipe: '滑动',
    pinch: '缩放',
    'select-rect': '框选',
    'select-lasso': '圈选',
    longpress: '长按',
    'text-native': '文字控制',
  }[type] || type;
}
