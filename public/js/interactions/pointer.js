// pointer.js — 统一鼠标/触摸/手势采集：点击/长按/滑动/捏合/框选/圈选
//
// 难点：iframe 会捕获落在其上的指针事件，父窗口 wrap 收不到。
// 方案：
//  - 普通模式(tap)：iframe 内脚本把 pointerdown/up（含坐标与命中 label）postMessage 给父窗口，
//    由此推导 tap / longpress / swipe。
//  - 选区模式(rect/lasso)：按住 Shift=框选 / Alt=圈选 时，overlay canvas 接管事件并绘制选区。
// 归一化输出 InteractionEvent 交给 emit 回调。

const LONG_PRESS_MS = 600;
const SWIPE_MIN = 0.05; // 归一化距离
const LASSO_MIN_POINTS = 8;

export function initPointer(emit) {
  const wrap = document.getElementById('stage-wrap');
  const canvas = document.getElementById('overlay');
  const ctx = canvas.getContext('2d');
  let mode = 'tap';

  function resize() { canvas.width = wrap.clientWidth; canvas.height = wrap.clientHeight; }
  resize();
  new ResizeObserver(resize).observe(wrap);
  function clearCanvas() { ctx.clearRect(0, 0, canvas.width, canvas.height); }

  canvas.style.pointerEvents = 'none';

  // 工具切换：Shift=框选，Alt=圈选
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Shift') { mode = 'rect'; canvas.style.pointerEvents = 'auto'; }
    else if (e.key === 'Alt') { mode = 'lasso'; canvas.style.pointerEvents = 'auto'; }
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === 'Shift' || e.key === 'Alt') { mode = 'tap'; canvas.style.pointerEvents = 'none'; clearCanvas(); }
  });

  // ===== tap / longpress / swipe：来自 iframe 的转发消息 =====
  let downInfo = null, longTimer = null;
  window.addEventListener('message', (e) => {
    const d = e.data;
    if (!d?.__aioux || d.kind !== 'frame-pointer') return;
    const nx = d.x / d.w, ny = d.y / d.h;
    if (d.phase === 'down') {
      downInfo = { x: nx, y: ny, t: Date.now(), label: d.label };
      clearTimeout(longTimer);
      longTimer = setTimeout(() => {
        if (downInfo) emit({ type: 'longpress', point: { x: nx, y: ny }, targetLabel: downInfo.label || undefined });
        downInfo = null;
      }, LONG_PRESS_MS);
    } else if (d.phase === 'up') {
      clearTimeout(longTimer);
      if (!downInfo) return;
      const dx = nx - downInfo.x, dy = ny - downInfo.y;
      const dlen = Math.hypot(dx, dy);
      if (dlen >= SWIPE_MIN) {
        const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? '右' : '左') : (dy > 0 ? '下' : '上');
        emit({ type: 'swipe', gesture: `滑动-向${dir}`, point: { x: nx, y: ny }, targetLabel: downInfo.label || undefined });
      } else {
        emit({ type: 'tap', point: { x: nx, y: ny }, targetLabel: downInfo.label || undefined });
      }
      downInfo = null;
    }
  });

  // ===== rect / lasso / pinch：overlay canvas 直接捕获 =====
  const pointers = new Map();
  let start = null, path = [], pinchStartDist = 0, pinchScale = 0;

  function rel(e) { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function norm(x, y) { return { x: x / canvas.width, y: y / canvas.height }; }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, rel(e));
    if (pointers.size === 2) { const p = [...pointers.values()]; pinchStartDist = dist(p[0], p[1]); return; }
    start = rel(e); path = [start];
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    const p = rel(e); pointers.set(e.pointerId, p);
    if (pointers.size === 2 && pinchStartDist) {
      const pts = [...pointers.values()]; pinchScale = dist(pts[0], pts[1]) / pinchStartDist; return;
    }
    if (!start) return;
    path.push(p);
    if (mode === 'rect') drawRect(start, p);
    else if (mode === 'lasso') drawPath(path);
  });
  canvas.addEventListener('pointerup', (e) => {
    pointers.delete(e.pointerId);
    if (pinchScale && Math.abs(pinchScale - 1) > 0.15) {
      emit({ type: 'pinch', gesture: pinchScale > 1 ? 'pinch-out(放大)' : 'pinch-in(缩小)',
        point: norm(canvas.width / 2, canvas.height / 2) });
      return resetGesture();
    }
    if (pointers.size > 0 || !start) return resetGesture();
    const end = rel(e);
    if (mode === 'rect') {
      const r = rectNorm(start, end);
      if (r.w > 0.02 && r.h > 0.02) emit({ type: 'select-rect', selection: { rect: r } });
    } else if (mode === 'lasso') {
      if (path.length >= LASSO_MIN_POINTS)
        emit({ type: 'select-lasso', selection: { path: path.map((p) => norm(p.x, p.y)) }, point: norm(end.x, end.y) });
    }
    clearCanvas(); resetGesture();
  });

  function resetGesture() { start = null; path = []; pinchStartDist = 0; pinchScale = 0; }
  function rectNorm(a, b) {
    return { x: Math.min(a.x, b.x) / canvas.width, y: Math.min(a.y, b.y) / canvas.height,
      w: Math.abs(b.x - a.x) / canvas.width, h: Math.abs(b.y - a.y) / canvas.height };
  }
  function drawRect(a, b) {
    clearCanvas(); ctx.strokeStyle = 'rgba(94,234,212,.9)'; ctx.lineWidth = 2; ctx.fillStyle = 'rgba(94,234,212,.12)';
    ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y); ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
  }
  function drawPath(pts) {
    clearCanvas(); ctx.strokeStyle = 'rgba(244,114,182,.9)'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); pts.forEach((p) => ctx.lineTo(p.x, p.y)); ctx.stroke();
  }
}
