// ar.js — WebXR immersive-ar 会话；不支持时降级为摄像头叠加并明确提示（非静默失败）
export function createAR(emit, onState, vision) {
  let session = null;

  async function toggle() {
    if (session) return end();
    return start();
  }

  async function start() {
    // 能力检测
    if (!navigator.xr) {
      onState?.('本设备/浏览器不支持 WebXR，降级为摄像头叠加模式', true);
      return fallbackToVision();
    }
    let supported = false;
    try { supported = await navigator.xr.isSessionSupported('immersive-ar'); } catch { supported = false; }
    if (!supported) {
      onState?.('不支持 immersive-ar，降级为摄像头叠加模式', true);
      return fallbackToVision();
    }
    try {
      session = await navigator.xr.requestSession('immersive-ar', { optionalFeatures: ['dom-overlay', 'hit-test'] });
      onState?.('AR 会话已启动（实验性）', false);
      session.addEventListener('end', () => { session = null; onState?.('AR 会话已结束', false); });
      // 简化：AR 场景内的“选择”事件作为一次交互意图发给模型
      session.addEventListener('select', () => {
        emit({ type: 'ar-select', gesture: 'AR 空间内选择', text: '用户在 AR 场景中选择了一个目标' });
      });
      return true;
    } catch (err) {
      onState?.(`AR 启动失败: ${err.message}，降级为摄像头叠加`, true);
      return fallbackToVision();
    }
  }

  function fallbackToVision() {
    // 复用 vision 模块作为“增强现实”的退化形态
    if (vision) { vision.toggle(); return false; }
    return false;
  }

  async function end() {
    try { await session?.end(); } catch {}
    session = null;
  }

  return { toggle, isActive: () => Boolean(session) };
}
