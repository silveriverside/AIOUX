// vision.js — 摄像头取帧 → base64 jpeg → 作为 image_url 交互发送
export function createVision(emit, onState) {
  let stream = null, active = false, videoEl = null;

  async function toggle() {
    if (active) return stop();
    return start();
  }

  async function start() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    } catch (err) {
      onState?.(`摄像头不可用: ${err.message}`, true);
      return false;
    }
    videoEl = document.createElement('video');
    videoEl.autoplay = true; videoEl.playsInline = true; videoEl.muted = true;
    videoEl.srcObject = stream;
    await videoEl.play().catch(() => {});
    active = true;
    onState?.('摄像头已开启，点击“视觉”再次以拍帧发送给模型', false);
    return true;
  }

  // 拍一帧并发送（供 main 在视觉模式下点击触发）
  function capture() {
    if (!active || !videoEl?.videoWidth) { onState?.('摄像头未就绪', true); return; }
    const canvas = document.createElement('canvas');
    const maxW = 768;
    const scale = Math.min(1, maxW / videoEl.videoWidth);
    canvas.width = videoEl.videoWidth * scale;
    canvas.height = videoEl.videoHeight * scale;
    canvas.getContext('2d').drawImage(videoEl, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    onState?.('画面已发送，模型理解中…', false);
    emit({ type: 'vision', image: { dataUrl } });
  }

  function stop() {
    stream?.getTracks().forEach((t) => t.stop());
    active = false; videoEl = null;
    onState?.('摄像头已关闭', false);
  }

  return { toggle, capture, isActive: () => active };
}
