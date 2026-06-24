# AIOUX

AIOUX 是一个实时生成式 UX（Generative User Experience）实验项目：用户用自然语言或多模态交互表达意图，后端调用模型生成/更新页面，前端在 sandbox iframe 中渲染，并把页面组织成可导航、可回退的 Page Graph。

## 当前状态

项目已具备完整 Demo 主链路：

- 文本交互、pointer 交互、语音、视觉、WebXR AR 入口。
- Page Graph、面包屑、节点历史、异步快照、版本回退。
- `create`、`navigate`、`stay/full`、`stay/patch` 决策落地。
- patch guard、失败回滚、最终 HTML sync。
- 记忆画像、素材复用、素材质量/风险排序信号。
- sandbox iframe 隔离、nonce/source 校验的 bridge 协议。
- 前端 trace 面板、后端结构化 timing 与 client-log。
- three.js 真 3D 变体：宿主 `stage.js` 包裹 `srcdoc` 时注入 importmap，模型使用裸导入，支持真实 WebGL 渲染。

最新验证基线：

- `node --test 'server/**/*.test.js' 'public/**/*.test.js'`：258/258 通过。
- `npm run e2e`：通过。
- `npm run eval:intent-routing`：80/80 通过。
- `npm run eval:asset-quality`：可输出素材质量排序报告。
- `npm run eval:variant-deviation`：可输出模型自选变体偏离率报告。

## 关键能力

### 生成式页面图谱

模型每次交互可以创建子页面、跳转既有页面或更新当前页。后端维护图谱结构和快照版本，前端展示面包屑、树和历史版本。

### 效果优先的变体选择

后端不再用关键词预锁单一变体，而是向模型注入候选变体，让模型按用户意图和效果优先选择。真实几何体（地球、星球、球体、产品模型等）被强制要求走真 3D（WebGL/three.js），禁止用平面图 `rotateY` 冒充。

### three.js 真 3D 渲染

`stage.js` 在 sandbox iframe 的 `srcdoc` 中固定注入 importmap：

- `three` -> jsdelivr three.module.js
- `three/addons/` -> jsdelivr examples/jsm/

three 变体 prompt 要求模型使用：

```js
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
```

这解决了 OrbitControls 内部裸说明符 `from 'three'` 在浏览器中无法解析导致的白屏问题。

### 渲染状态可观测

sandbox iframe 不能被父页面直接读取 DOM，因此 bridge 会主动回传：

- `ok`
- `hasCanvas`
- `sceneType`
- `error`

前端记录为 `frame_render_status` trace，并 POST 到 `/api/client-log`，后端输出 `[client-log]`，便于统计真实 3D 渲染成功率。

### 模型 JSON 门禁

解析层对模型决策 JSON 做显式门禁和回归保护：

- 顶层非对象、数组包裹、嵌套 `decision`。
- 截断 JSON、尾部截断候选。
- 缺失/污染关键字段。
- 非法 `action` / `mode`。
- 多 JSON 候选与自然语言混入。
- 重复关键字段，包括 Unicode escape。
- 字段边界整体右移，例如 `":true,": "create"`、`nodeId{`、`html{`。

可恢复损坏会带警告继续落地；不可恢复短乱码会显式 no_update，并记录 `[parse-debug]` 便于后续分析。

## 运行

准备 `.env`：

```bash
STEPFUN_API_KEY=...
```

安装依赖：

```bash
npm install
```

启动：

```bash
npm start
```

默认地址：

```text
http://localhost:3000
```

## 测试与评估

全量单测：

```bash
node --test 'server/**/*.test.js' 'public/**/*.test.js'
```

端到端测试：

```bash
npm run e2e
```

意图路由评估：

```bash
npm run eval:intent-routing
```

素材质量评估：

```bash
npm run eval:asset-quality
```

变体偏离评估：

```bash
npm run eval:variant-deviation
```

## 文档

- 当前路线看板：[`.trae/documents/AIOUX-roadmap-current.md`](.trae/documents/AIOUX-roadmap-current.md)
- 全局进展总览：[`.trae/documents/AIOUX-global-progress.md`](.trae/documents/AIOUX-global-progress.md)
- 需求/架构/历史状态：[`.trae/documents/AIOUX-project-requirements-architecture-status.md`](.trae/documents/AIOUX-project-requirements-architecture-status.md)
- Demo 计划：[`.trae/documents/AIOUX-live-genui-demo-plan.md`](.trae/documents/AIOUX-live-genui-demo-plan.md)

## 当前风险

- 模型 JSON 输出仍存在概率性短乱码，已记录 `[parse-debug]` 并做可恢复路径，但更稳定的方案可能需要 `json_schema strict` 或“两阶段生成”。
- 视觉质量仍依赖 prompt 与模型执行质量；three 天体细节已有光环/卫星/风暴约束，但仍建议建立截图回看和视觉质量评估器。
- sandbox 内联脚本目前允许在 iframe 内执行，但不能访问父页面 DOM；是否进一步禁用/收紧需要单独策略确认。
- snapshot job 状态仍是进程内存，服务重启后历史 jobId 不可恢复。
