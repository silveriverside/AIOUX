// 素材在线源：URL 构造（纯字符串）与可注入 fetch 的可达性探测。
// 设计原则：构造函数无副作用、可单测；探测显式区分超时/坏状态/网络错误。

// text_to_image 接口支持的 image_size 取值（见 server/prompt.js 第 53 行用法）。
const ALLOWED_IMAGE_SIZES = new Set([
  'square_hd',
  'square',
  'portrait_4_3',
  'portrait_16_9',
  'landscape_4_3',
  'landscape_16_9',
]);

const DEFAULT_IMAGE_SIZE = 'landscape_16_9';

/**
 * 构造站内 text_to_image 生成图 URL。
 * @param {string} promptEn 英文视觉提示
 * @param {{imageSize?: string}} [opts]
 * @returns {string}
 */
export function buildText2ImageUrl(promptEn, { imageSize = DEFAULT_IMAGE_SIZE } = {}) {
  const size = ALLOWED_IMAGE_SIZES.has(imageSize) ? imageSize : DEFAULT_IMAGE_SIZE;
  const prompt = encodeURIComponent(String(promptEn || ''));
  return `https://copilot-cn.bytedance.net/api/ide/v1/text_to_image?prompt=${prompt}&image_size=${size}`;
}

/**
 * 构造 Unsplash 关键词直链。
 * @param {string[]} keywords
 * @param {{size?: string}} [opts]
 * @returns {string}
 */
export function buildUnsplashKeywordUrl(keywords, { size = '1600x900' } = {}) {
  const list = Array.isArray(keywords) ? keywords : [keywords];
  const query = list
    .map((k) => String(k || '').trim())
    .filter(Boolean)
    .map((k) => encodeURIComponent(k))
    .join(',');
  return `https://source.unsplash.com/${size}/?${query}`;
}

/**
 * 构造 Iconify 图标 SVG URL。
 * @param {string} name 图标名
 * @param {{set?: string}} [opts] 图标集，默认 mdi（Material Design Icons）
 * @returns {string}
 */
export function buildIconUrl(name, { set = 'mdi' } = {}) {
  const safeSet = encodeURIComponent(String(set || 'mdi'));
  const safeName = encodeURIComponent(String(name || ''));
  return `https://api.iconify.design/${safeSet}/${safeName}.svg`;
}

/**
 * 探测一个素材 URL 是否可达（HEAD 失败回退 GET，跟随重定向，带超时）。
 * 失败显式区分 reason，绝不把失败当成功。
 * @param {string} url
 * @param {{timeoutMs?: number, fetchImpl?: typeof fetch}} [opts]
 * @returns {Promise<{ok: boolean, status: number, finalUrl: string, reason: string}>}
 */
export async function probeAssetUrl(url, { timeoutMs = 4000, fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') {
    return { ok: false, status: 0, finalUrl: url, reason: 'no_fetch' };
  }

  const attempt = async (method) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, {
        method,
        redirect: 'follow',
        signal: controller.signal,
      });
      const status = res.status;
      const finalUrl = res.url || url;
      const ok = status >= 200 && status < 300;
      return { ok, status, finalUrl, reason: ok ? 'ok' : 'bad_status' };
    } catch (err) {
      if (err && err.name === 'AbortError') {
        return { ok: false, status: 0, finalUrl: url, reason: 'timeout' };
      }
      console.warn(`[assets] probe ${method} 失败 url=${url}:`, err?.message || err);
      return { ok: false, status: 0, finalUrl: url, reason: 'network_error' };
    } finally {
      clearTimeout(timer);
    }
  };

  const head = await attempt('HEAD');
  if (head.ok) return head;
  // HEAD 可能不被支持（很多图床/接口拒绝 HEAD），回退 GET 再判一次。
  const get = await attempt('GET');
  return get.ok ? get : head.reason === 'timeout' ? head : get;
}
