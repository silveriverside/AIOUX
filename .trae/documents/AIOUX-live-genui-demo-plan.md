# AIOUX — Step-3.5-Flash 实时生成式 UX 交互 Demo 计划

## 1. Summary（概述）

构建一个**生成式交互界面（GenUI, Generative UI）Demo**：用户通过多种自然交互方式（鼠标/触摸/手势/语音/摄像头视觉/AR）表达意图，前端把"交互事件 + 上下文"打包发给后端，后端调用阶跃星辰 **step-3.5-flash**（高速多模态大模型）。模型用**混合机制**返回结果——先输出一段**决策 JSON**（判断是否更新、意图、**导航动作**），再附带 **HTML 负载**；前端在 **sandbox iframe** 中实时渲染。

**核心范式：页面图谱（Page Graph）。** 不是"单个 HTML 的版本线"，而是**多个有关联的页面节点**构成的图：每个节点是一个有稳定身份（nodeId）的 HTML 页面（如 main、广州地图、广州塔详情），节点之间有**层级/关联关系**（父子、同类、相关）。用户从初始**空白欢迎页**出发，每次交互后模型决定是：在当前节点生成新版本（`stay`）、跳到一个**已存在**的关联节点（`navigate`）、还是派生一个**新子节点**（`create`）。每个节点自身用 git 维护版本历史；节点关系存于 `graph.json`。由此可逐级回退、跳回任意去过的节点、一键回到 main —— 借鉴 Flipbook 的"路径可回溯"哲学，但建立在真实 HTML 节点而非像素快照栈之上。

设计哲学借鉴 **Flipbook**（任意交互 → 模型推断意图 → 实时刷新 → 路径可回溯），技术路径借鉴 **OpenUI / Renderify**（LLM 输出真实 HTML → 浏览器 sandbox 实时渲染，无需后端编译）。

**与 Flipbook 的本质差异（调研结论）：**
- Flipbook 用图像/视频模型逐帧重画像素，"回退"是线性**状态快照栈**，一致性差（实测 iPhone17 画成16、点8出7、中文乱码）。
- 我们生成**真实 HTML**，节点有稳定 id 与结构，一致性/可控性天然更强；"回退"是在**真实页面图谱**上导航，且每个节点还能有 git 版本。

**专业概念说明（首次出现）：**
- **GenUI（Generative UI，生成式用户界面）**：界面由大模型按用户意图实时生成。
- **Page Graph（页面图谱）**：以页面节点为顶点、关联关系为边的有向图，支撑层级导航与回溯。
- **WebXR**：浏览器原生的 AR/VR（增强/虚拟现实）标准 API。
- **SSE（Server-Sent Events）**：HTTP 单向流式推送。
- **sandbox iframe**：带 `sandbox` 属性的隔离内嵌框架，安全执行模型生成的 HTML/JS。

## 2. Current State Analysis（现状分析）

- 项目目录 `/Users/bytedance/Desktop/project/AIOUX` 当前为空，从零搭建。
- StepFun Chat Completions API（已核实文档）：
  - 端点 `POST https://api.stepfun.com/v1/chat/completions`，**OpenAI 兼容**。
  - `step-3.5-flash` 多模态输入：文本、图片（`image_url`，base64 `data:image/...`）、视频（`video_url`）、音频（`input_audio`，base64 mp3/wav）。
  - 支持 `stream=true`、`response_format` 的 `json_object` 与 `json_schema`（仅 step-3.5-flash 系列支持 json_schema strict）。
  - 鉴权：`Authorization: Bearer $STEPFUN_API_KEY`。

## 3. 架构总览

```
用户多模态交互 (pointer/手势/语音/摄像头/WebXR)
        │ 采集+归一化为 InteractionEvent
        ▼
前端编排 (main.js) ──POST /api/interact──▶ 后端 (Express)
   │  携带: 交互事件 + 当前 nodeId + 当前页HTML摘要        │ 组装多模态 messages
   │  + 图谱概要(已有节点列表)                            ▼
   ▼                                              step-3.5-flash
sandbox iframe 渲染                                     │ 混合输出
   ▲                                                    ▼
   │   决策JSON: {shouldUpdate, action, nodeId, parentId, title, intent, reasoning, mode, html, patches}
   │        │
   │        ├─ action=stay     → 当前节点新版本，git commit
   │        ├─ action=navigate → 切到已存在节点(取其最新版HTML)
   │        └─ action=create   → 新建子节点+建立父子边，git commit
   ▼                                                    ▼
图谱导航/面包屑 (graph.js) ◀──── snapshots仓库: pages/<nodeId>.html (git) + graph.json
```

**页面图谱模型：**
- 节点：`{ nodeId, title, parentId, createdFrom(intent), latestCommit }`，HTML 存于 `snapshots/pages/<nodeId>.html`。
- 边：父子（create 时建立）+ 关联（navigate 时可记录跳转轨迹）。
- `graph.json`：持久化所有节点与关系，前端据此渲染导航树/面包屑。
- 当前位置：后端维护"当前 nodeId"，前端面包屑显示从 main 到当前节点的路径。

**混合机制 + 导航决策契约（核心）**——模型用 `response_format: json_object` 返回：
```json
{
  "shouldUpdate": true,
  "action": "create",
  "nodeId": "main__guangzhou_map__canton_tower",
  "parentId": "main__guangzhou_map",
  "title": "广州塔详情",
  "intent": "用户圈选了地图上的广州塔，想看它的细节",
  "reasoning": "圈选手势聚焦单个地标，应派生子页而非改当前页",
  "mode": "full",
  "html": "<div>...完整 HTML/内联CSS/内联JS...</div>",
  "patches": []
}
```
- `action=stay`：更新当前节点 → `mode=full` 整页 或 `mode=patch` 增量（`patches:[{selector,action:replace|append|remove,html}]`），git commit 一个新版本。
- `action=navigate`：`nodeId` 指向**已存在**节点 → 后端取该节点最新版 HTML 返回，不新增 commit（仅记录导航）。
- `action=create`：新建节点，`parentId` 指向来源节点，建立父子边，git commit 初版。
- `shouldUpdate=false`：无需改界面（无意义/重复交互），不渲染不 commit，仅状态栏提示 reasoning。

## 4. Proposed Changes（具体改动）

> 初次从零 build 较大项目，文件数超 3 属规则例外。每脚本控制 200 行内，超出按模块拆分。

### 4.1 骨架与配置
- **`package.json`**：依赖 `express`、`simple-git`、`dotenv`；脚本 `start`/`dev`。
- **`.env`**（执行阶段建空模板，用户粘贴 key）：`STEPFUN_API_KEY=`、`PORT=3000`、`STEP_MODEL=step-3.5-flash`。
- **`.gitignore`**：忽略 `node_modules`、`.env`、`snapshots/`（快照为独立 git）。

### 4.2 后端 `server/`
- **`server/config.js`**：dotenv 读取并集中导出配置（key、model、端口、snapshots 路径）。
- **`server/stepfun.js`**：StepFun 客户端，封装 `chatCompletion(messages,{stream,response_format})`，原生 `fetch`，Bearer 鉴权，错误处理。
- **`server/intent.js`**：意图编排核心。
  - `buildMessages(interaction, currentNode, graphSummary)`：把交互事件 + 当前节点 HTML 摘要 + **图谱概要（已有节点 id/title 列表，供模型判断 navigate 目标）** 组装为多模态 messages；system 提示词约束输出契约、导航动作语义、HTML 安全约束。
  - `parseHybridOutput(raw)`：解析校验决策 JSON，非法时记录为待修复 bug 并返回 `shouldUpdate=false`（不静默吞错）。
- **`server/graph.js`**：页面图谱管理。读写 `graph.json`；`addNode`/`getNode`/`listNodes`/`setCurrent`/`getCurrent`/`getBreadcrumb(nodeId)`。
- **`server/snapshots.js`**：git 版本管理（simple-git）。启动时 `git init` 独立 `snapshots/`；`commitNode(nodeId, html, meta)` 写 `pages/<nodeId>.html` 并 commit；`getNodeHtml(nodeId)`、`listNodeHistory(nodeId)`、`revertNode(nodeId, hash)`。
- **`server/routes.js`**：
  - `POST /api/interact`：交互 → intent → stepfun → 按 action 操作 graph/snapshots → 返回 {决策, html/patches, breadcrumb, graph}。
  - `GET /api/graph`：返回图谱（节点+关系+当前位置）。
  - `POST /api/navigate`：手动跳到指定 nodeId（用户点面包屑/导航树）。
  - `POST /api/revert`：把某节点回退到指定版本。
- **`server/index.js`**：Express 入口，静态托管 `public/`，挂载路由，监听端口。

### 4.3 前端 `public/`
- **`public/index.html`**：主壳。① 中央 **sandbox iframe 舞台**；② 顶部控制栏（交互模式开关+文本输入）；③ **面包屑 + 图谱导航面板**（替代原"历史面板"，展示节点树、当前路径，支持跳转/回退/回 main）；④ 状态栏（模型 reasoning/intent/action）。**初始为空白欢迎页**，提示用户输入或交互以生成首个节点。
- **`public/css/main.css`**：炫酷风格（深色玻璃拟态、霓虹高亮、过渡动画）、选区可视化、图谱节点高亮。
- **`public/js/api.js`**：通信封装（`postInteract`、`getGraph`、`postNavigate`、`postRevert`）。
- **`public/js/stage.js`**：iframe 渲染器。`renderFull(html)`、`applyPatches(patches)`、`getCurrentHtml()`。
- **`public/js/graph.js`**：图谱导航面板。渲染节点树/面包屑，点击节点→`postNavigate`，节点版本列表→`postRevert`，回 main 按钮。
- **`public/js/main.js`**：编排。初始化交互模块 → 归一化事件 → `postInteract` → 按 action+mode 渲染 → 刷新图谱/面包屑 → 更新状态栏。
- **交互采集模块 `public/js/interactions/`**（每种独立模块，便于扩展）：
  - **`pointer.js`**：Pointer Events 统一鼠标+触摸+手势。实现 点击/长按/滑动/捏合/框选(rect)/圈选(lasso)/长按选中，归一化为带坐标/选区/手势类型事件。
  - **`voice.js`**：`MediaRecorder` 录音 → base64(wav/mp3) → 作 `input_audio` 发送。
  - **`vision.js`**：`getUserMedia` 取摄像头帧 → canvas 转 base64 jpeg → 作 `image_url` 发送。
  - **`ar.js`**：WebXR `immersive-ar`；不支持时降级为摄像头叠加并明确提示（非静默失败）。
  - **`index.js`**：交互模块注册表，统一暴露事件订阅接口（预留扩展点）。

## 5. Assumptions & Decisions（假设与决策）

1. **技术栈**：Node + Express + 原生前端（用户确认）。后端必需：隐藏 key、管 git、跨域。
2. **混合机制 + 页面图谱**（用户确认）：决策 JSON 含导航动作 stay/navigate/create，`json_object` 模式；首版 system 提示词约束，必要时升级 `json_schema` strict。
3. **导航由模型决定**（用户确认）：模型判断 action 并给出 nodeId/parentId/title；前端也提供手动导航（面包屑/树）作为兜底。
4. **初始页**：空白欢迎页，首次交互后生成首个节点（用户确认）。
5. **git trace**：独立 `snapshots/` 仓库，按节点 id 组织 HTML + `graph.json`。
6. **MVP 交互**（用户确认）：pointer 全套手势 + 语音 + 摄像头视觉 + AR(WebXR)。
7. **API Key**：执行阶段建 `.env` 模板，用户粘贴（用户确认）。
8. **流式**：首版非流式（JSON 完整返回更稳）；流式为后续增强。
9. **图片生成素材**：暂不实现，以网络素材+代码为主；作为后续扩展点预留（用户确认）。
10. **安全降级原则**：解析失败/模型异常时明确记录并标注待修复 bug，绝不静默降级；核心逻辑不降级。
11. **AR 限制**：WebXR 桌面多不支持，移动端 Chrome 较好；不支持降级为摄像头叠加并提示。

## 6. Verification（验证步骤）

1. `npm install && npm start`，访问 `http://localhost:3000`，空白欢迎页 + 控制栏/导航面板可见。
2. **首节点**：输入"做一张广州旅游地图" → `action=create`，生成 main 的子节点并渲染，`snapshots/pages/` 出现该节点文件 + 一次 commit，图谱新增节点。
3. **派生子节点**：在地图上圈选广州塔 → `action=create` 派生"广州塔详情"子节点，面包屑显示 main › 广州地图 › 广州塔详情。
4. **回退导航**：点面包屑"广州地图" → `navigate` 回到该节点最新版（真实 HTML，非快照图）。
5. **同节点更新**：在某页要求"换成夜景配色" → `action=stay`，该节点新增 git 版本，节点版本列表可见 v1/v2。
6. **跨节点跳转**：要求"回到广州地图看看美食" → 模型 navigate 到已存在节点或 create 关联节点，验证图谱关系正确。
7. **语音/摄像头/AR**：分别验证 base64 音频/图随请求发送且模型响应；AR 不支持设备验证降级提示。
8. **无意义交互**：随机点空白 → `shouldUpdate=false`，无新节点/commit。
9. **回 main**：点"回到主页" → 回到 main 节点。

## 7. 边缘案例（执行后需覆盖测试）

- 模型返回非法 JSON / HTML 截断 → 解析降级 + 错误标注。
- 模型 navigate 到不存在的 nodeId → 校验失败，降级为 create 或提示。
- nodeId 冲突/重复 → 生成唯一 id 策略（父id+slug+序号）。
- 超长 HTML 超上下文 → 仅回传当前页 HTML 摘要 + 图谱概要而非全文。
- 无麦克风/摄像头/WebXR 权限 → 各模块独立降级、互不影响。
- 快照 commit / graph.json 写入失败 → 错误上报，不阻塞主交互。
- 高频交互（连续滑动）→ 前端节流 + 后端去重，避免请求风暴。
- 图谱出现环 / 孤儿节点 → 导航面板容错渲染。
- iframe sandbox 内脚本越权 → sandbox 属性白名单限制。

## 8. 本轮修复与验收记录（2026-06-04）

- 修复 `step-3.5-flash` 在 `json_object` 模式下偶发字段名损坏的问题：增强 system prompt，要求纯 JSON 输出、控制 HTML 长度，并加入最小 few-shot 示例稳定格式。
- 增强 `parseHybridOutput` 鲁棒解析：支持空 key、`nodeId{`/`parentId{` 等损坏字段名、HTML/nodeId 值错位、尾部 `{` 污染、缺失 `shouldUpdate`/`action` 的语义推断。
- 明确异常行为：非合法 JSON 或字段损坏都会返回/记录 error，标注为模型输出 bug；能安全恢复时继续应用，不能恢复时 `shouldUpdate=false` 且不静默吞错。
- 提升模型输出容量：`server/stepfun.js` 默认 `max_tokens` 从 8192 提升到 16384，并在 prompt 中要求 HTML 控制在 5000 字符内，降低截断概率。
- 验收结果：`/api/status` 返回 `hasApiKey=true`；StepFun 直连测试返回 HTTP 200；创建 `beijing_map` 成功；从 `beijing_map` 点击天安门成功创建 `beijing_tiananmen`；面包屑为 `主页 > 北京旅游地图 > 天安门广场`；`beijing_tiananmen` Git 历史包含 `[create] 天安门广场: 查看天安门广场详细信息`。
- 仍需关注：模型仍会偶发损坏 JSON 字段名，当前实现会显式告警并恢复；后续可升级为 `json_schema strict` 或拆分“决策 JSON”和“HTML 生成”两阶段调用进一步稳定。
