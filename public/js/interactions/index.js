// 交互模块注册表：统一初始化各交互方式，向 main 暴露事件订阅与控制接口。
// 新增交互方式时在此注册即可（预留扩展点）。
import { initPointer } from './pointer.js';
import { createVoice } from './voice.js';
import { createVision } from './vision.js';
import { createAR } from './ar.js';

export function initInteractions({ emit, onState }) {
  // 节流：避免高频交互（连续滑动等）造成请求风暴
  let last = 0;
  const THROTTLE_MS = 350;
  const throttledEmit = (ev) => {
    const now = Date.now();
    // 文本/语音/视觉/AR 等显式操作不节流；仅对高频指针手势节流
    const highFreq = ['tap', 'swipe', 'longpress', 'pinch'].includes(ev.type);
    if (highFreq && now - last < THROTTLE_MS) return;
    last = now;
    emit(ev);
  };

  initPointer(throttledEmit);
  const voice = createVoice(emit, onState);
  const vision = createVision(emit, onState);
  const ar = createAR(emit, onState, vision);

  return { voice, vision, ar };
}
