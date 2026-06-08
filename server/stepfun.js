// StepFun Chat Completions 客户端（OpenAI 兼容）
import { STEPFUN_API_KEY, STEPFUN_ENDPOINT, STEP_MODEL, HAS_API_KEY } from './config.js';

/**
 * 调用 step-3.5-flash 非流式 Chat Completions。
 * @param {Array} messages - OpenAI 兼容的多模态消息数组
 * @param {object} opts
 * @param {object} [opts.response_format] - 如 { type: 'json_object' }
 * @param {number} [opts.temperature]
 * @param {number} [opts.max_tokens]
 * @returns {Promise<string>} 模型返回的 message.content 文本
 */
export async function chatCompletion(messages, opts = {}) {
  if (!HAS_API_KEY) {
    // 明确报错，不静默降级（核心逻辑依赖真实模型输出）
    throw new Error('STEPFUN_API_KEY 未配置，请在 .env 中填写后重启服务。');
  }

  const body = {
    model: STEP_MODEL,
    messages,
    temperature: opts.temperature ?? 0.6,
    max_tokens: opts.max_tokens ?? 16384,
  };
  if (opts.response_format) body.response_format = opts.response_format;

  let resp;
  try {
    resp = await fetch(STEPFUN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${STEPFUN_API_KEY}`,
      },
      body: JSON.stringify(body),
    });
  } catch (networkErr) {
    // 网络中断/波动：抛出，由上层决定重试或提示
    throw new Error(`StepFun 网络请求失败: ${networkErr.message}`);
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`StepFun API 错误 ${resp.status}: ${text.slice(0, 500)}`);
  }

  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error('StepFun 返回结构异常：缺少 choices[0].message.content');
  }
  return content;
}
