// 集中读取并导出配置常量
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 项目根目录（server 的上一级）
export const ROOT_DIR = path.resolve(__dirname, '..');

// 快照仓库目录（独立 git，存放 pages/<nodeId>.html 与 graph.json）
// 测试可通过 AIOUX_SNAPSHOTS_DIR 指向临时目录，避免污染真实快照仓库。
export const SNAPSHOTS_DIR = process.env.AIOUX_SNAPSHOTS_DIR
  ? path.resolve(process.env.AIOUX_SNAPSHOTS_DIR)
  : path.join(ROOT_DIR, 'snapshots');
export const PAGES_DIR = path.join(SNAPSHOTS_DIR, 'pages');
export const GRAPH_FILE = path.join(SNAPSHOTS_DIR, 'graph.json');

export const PORT = Number(process.env.PORT) || 3000;
export const STEP_MODEL = process.env.STEP_MODEL || 'step-3.5-flash';
export const STEPFUN_API_KEY = process.env.STEPFUN_API_KEY || '';
export const STEPFUN_ENDPOINT = 'https://api.stepfun.com/v1/chat/completions';

// 标识 key 是否就绪，缺失时路由层会明确报错而不是静默失败
export const HAS_API_KEY = STEPFUN_API_KEY.trim().length > 0;

// 允许引用的外链素材/库域名白名单。
// 策略：页面不再要求完全自包含，可引用白名单内的图片、icon、视频、3D 模型与 CDN 库。
// 维护原则：只放开“资源引用”，脚本越权与危险协议仍由 patch 风险评分等机制拦截。
export const ALLOWED_ASSET_DOMAINS = [
  // 站内图片生成接口（稳定素材）
  'copilot-cn.bytedance.net',
  // 常用 CDN 库（three.js / GSAP 等）
  'unpkg.com',
  'cdn.jsdelivr.net',
  'cdnjs.cloudflare.com',
  // 常用免费图片/视频素材
  'images.unsplash.com',
  'source.unsplash.com',
  'images.pexels.com',
  'cdn.pixabay.com',
  // 图标
  'cdn.simpleicons.org',
  'api.iconify.design',
];
