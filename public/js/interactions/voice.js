// voice.js — 麦克风录音 → base64(webm/wav) → 作为 input_audio 交互发送
// 注意：StepFun 文档标注音频仅支持 mp3/wav；MediaRecorder 实际多产出 webm。
// 这里如实记录该限制：优先尝试 audio/wav，不支持则用浏览器默认（webm），由后端/模型侧兼容情况决定。
// 若模型拒绝该格式，将在状态栏报错（不静默吞错）。

export function createVoice(emit, onState) {
  let recorder = null, chunks = [], stream = null, recording = false;

  async function toggle() {
    if (recording) return stop();
    return startRec();
  }

  async function startRec() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      onState?.(`麦克风不可用: ${err.message}`, true);
      return false;
    }
    const mime = MediaRecorder.isTypeSupported('audio/wav') ? 'audio/wav'
      : (MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '');
    recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    chunks = [];
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = onStop;
    recorder.start();
    recording = true;
    onState?.('录音中…再次点击结束', false);
    return true;
  }

  function stop() {
    if (recorder && recording) recorder.stop();
    recording = false;
  }

  async function onStop() {
    stream?.getTracks().forEach((t) => t.stop());
    const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
    const dataUrl = await blobToDataUrl(blob);
    const format = (recorder.mimeType || '').includes('wav') ? 'wav' : 'webm';
    onState?.('语音已发送，模型理解中…', false);
    emit({ type: 'voice', audio: { dataUrl, format } });
  }

  return { toggle, isRecording: () => recording };
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}
