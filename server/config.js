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
export const SNAPSHOTS_DIR = path.join(ROOT_DIR, 'snapshots');
export const PAGES_DIR = path.join(SNAPSHOTS_DIR, 'pages');
export const GRAPH_FILE = path.join(SNAPSHOTS_DIR, 'graph.json');

export const PORT = Number(process.env.PORT) || 3000;
export const STEP_MODEL = process.env.STEP_MODEL || 'step-3.5-flash';
export const STEPFUN_API_KEY = process.env.STEPFUN_API_KEY || '';
export const STEPFUN_ENDPOINT = 'https://api.stepfun.com/v1/chat/completions';

// 标识 key 是否就绪，缺失时路由层会明确报错而不是静默失败
export const HAS_API_KEY = STEPFUN_API_KEY.trim().length > 0;
