// Express 入口：静态托管 public/，挂载路由，初始化图谱与快照仓库
import express from 'express';
import path from 'node:path';
import { router } from './routes.js';
import { initGraph } from './graph.js';
import { initSnapshots } from './snapshots.js';
import { loadPresetVariants } from './presetRegistry.js';
import { PORT, ROOT_DIR, HAS_API_KEY } from './config.js';

async function start() {
  await initSnapshots();
  initGraph();
  // 加载场景预设变体（server/presets/variants/ 下各文件自注册），目录不存在则跳过。
  const variantResult = await loadPresetVariants();
  console.log(`[presetRegistry] 变体加载完成 loaded=${variantResult.loaded} reason=${variantResult.reason || 'ok'}`);

  const app = express();
  // 多模态 base64（音频/图片）体积较大，放宽 body 限制
  app.use(express.json({ limit: '25mb' }));
  app.use(express.static(path.join(ROOT_DIR, 'public')));
  app.use(router);

  app.listen(PORT, () => {
    console.log(`\n  AIOUX 已启动: http://localhost:${PORT}`);
    if (!HAS_API_KEY) {
      console.warn('  [警告] STEPFUN_API_KEY 未配置，交互请求会报错。请在 .env 填入后重启。');
    }
  });
}

start().catch((err) => {
  console.error('启动失败:', err);
  process.exit(1);
});
