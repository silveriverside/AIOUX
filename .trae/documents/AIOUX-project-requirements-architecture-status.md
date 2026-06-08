# AIOUX 项目需求、架构、功能与进度总文档

> 更新时间：2026-06-06
> 项目路径：`/Users/bytedance/Desktop/project/AIOUX`
> 当前模型：阶跃星辰 `step-3.5-flash`
> 当前技术栈：Node.js + Express + 原生前端 + sandbox iframe + simple-git

## 1. 用户原始需求落盘

### 1.1 初始需求

用户希望基于阶跃星辰 `step-3.5-flash` 高速多模态模型，制作一个“实时生成式 UX 交互 Demo”。核心想法是：

- 用户通过多种自然交互方式表达意图。
- 模型理解意图后，实时生成或更新 HTML 界面。
- 前端将模型生成的 HTML 渲染出来，形成可交互、可探索的动态体验。
- 交互方式尽可能覆盖常见输入：AR 视觉、手势、视觉理解、鼠标、触摸、捏合、滑动、点击、长按、框选、圈选、长按选中、语音等。
- 模型需要能判断“是否要更新界面”，不是所有交互都强制刷新。
- 生成和演化过程最好结合 git 控制，方便回退和记录 trace。

### 1.2 用户补充需求

用户提出了一个关键产品洞察：借鉴 Flipbook 的“路径可回溯”体验，但不要简单做单页面版本历史。

原始表达要点：

- 从一个初始页面出发，例如 `main.html`。
- 交互后生成的新页面可能不是原页面的新版本，而是进入一个有层级关系或归类关系的子页面。
- 例如 `main` → `广州旅游地图` → `广州塔详情`。
- 用户可以不断跳转到曾经生成过的页面，也可以回到初始页面。
- 每个页面本身可以有 git 版本历史。
- 项目不是“所有交互都生成同一个 HTML 的不同版本”，而是“多个有关联的 HTML 页面，各自有不同版本”。

这被整理为项目核心范式：**页面图谱（Page Graph，页面节点及其关系组成的图结构）**。

### 1.3 已确认的技术和产品决策

- 使用 Node.js + Express 作为后端，隐藏 API key，处理模型调用、图谱状态和 git 快照。
- 使用原生前端，不引入 React/Vue 等框架，降低 Demo 复杂度。
- `.env` 存放 `STEPFUN_API_KEY`、`PORT`、`STEP_MODEL`。
- 首版以网络素材和代码生成 UI 为主，暂不接入独立图片生成模型。
- 模型输出采用混合机制：决策 JSON + HTML 负载。
- 初始页为空白欢迎页，首个有效意图生成第一个页面节点。
- git trace 采用独立 `snapshots/` 仓库，而不是污染主项目仓库。
- 模型异常、解析失败、网络失败必须显式报错，不把异常伪装成正常业务行为。

## 2. 需求文档（PRD）

### 2.1 项目目标

构建一个可运行的实时生成式 UX Demo。用户输入自然语言或多模态交互后，模型根据上下文生成页面、更新页面或切换到已有页面，前端即时渲染，后端记录页面图谱和 git 历史。

### 2.2 目标用户

- 想探索生成式 UI/UX 交互范式的产品、设计、研发人员。
- 想验证多模态模型能否承担实时界面生成和导航决策的研究人员。
- 想把“内容展示”做成可探索页面网络，而不是固定线性页面的 Demo 使用者。

### 2.3 核心用户故事

- 作为用户，我可以输入“做一张广州旅游地图”，系统创建一个广州旅游地图页面。
- 作为用户，我可以点击或圈选“广州塔”，系统创建广州塔详情子页面。
- 作为用户，我可以通过面包屑回到广州旅游地图或主页。
- 作为用户，我可以对当前页面说“换成夜景风格”，系统在当前节点生成一个新版本。
- 作为用户，我可以查看某个节点的历史版本，并回退到旧版本。
- 作为用户，我可以通过语音、摄像头画面、鼠标、触摸、手势等不同方式表达意图。
- 作为用户，我可以看到模型是否真的更新了页面，以及为什么更新或不更新。

### 2.4 MVP 范围

MVP 已覆盖或正在覆盖以下能力：

- 文本意图输入。
- Pointer Events 统一鼠标、触摸和基础手势。
- 点击、长按、滑动、捏合、框选、圈选。
- 语音录制并发送给模型。
- 摄像头拍帧并发送给模型。
- WebXR AR 会话能力检测和实验性选择事件。
- 模型决策 `shouldUpdate`、`action`、`nodeId`、`parentId`、`title`、`intent`、`reasoning`、`mode`、`html`、`patches`。
- 页面图谱持久化。
- 页面 HTML git 快照和版本历史。
- 手动导航、面包屑、节点树、版本回退。
- 基于 system prompt 的体验范式分流：沉浸多媒体阅读、卡片浏览、2D 可视化交互、3D 可视化交互。

### 2.5 非 MVP 范围

- 独立图片生成模型接入。
- 多用户协同。
- 云端部署和权限系统。
- 复杂前端框架工程化。
- 完整 AR 场景渲染和空间锚点管理。
- 严格生产级安全沙箱审计。
- 大规模自动化测试体系。

## 3. 技术架构

### 3.1 总体架构

```text
用户输入/交互
  ├─ 文本
  ├─ 鼠标/触摸/手势
  ├─ 语音
  ├─ 摄像头视觉
  └─ WebXR AR
        │
        ▼
前端交互采集与归一化
        │ InteractionEvent
        ▼
Express 后端 /api/interact
        │
        ├─ 读取当前 Page Graph 状态
        ├─ 读取当前节点 HTML
        ├─ 组装 step-3.5-flash messages
        ├─ 调用 StepFun Chat Completions API
        ├─ 解析并修复模型 JSON 输出
        ├─ 应用 stay / navigate / create 决策
        ├─ 更新 graph.json
        └─ 写入 snapshots git commit
        │
        ▼
前端 sandbox iframe 渲染 HTML
        │
        ├─ 更新面包屑
        ├─ 更新节点树
        └─ 更新版本列表/状态栏
```

### 3.2 页面图谱架构

页面图谱不是线性历史，而是节点网络：

- 节点：一个稳定 `nodeId` 对应一个 HTML 页面。
- 父子关系：`create` 时创建新节点，`parentId` 指向来源节点。
- 当前节点：后端维护 `graph.current`。
- 面包屑：从 `main` 沿 `parentId` 回溯到当前节点。
- 版本历史：每个节点自己的 HTML 文件由 git 管理。

核心状态文件：

- `snapshots/graph.json`：页面图谱结构和当前节点。
- `snapshots/pages/<nodeId>.html`：每个页面节点的最新 HTML。
- `snapshots/.git`：独立 git 仓库，记录节点 HTML 和图谱变化。

### 3.3 后端模块

| 模块 | 职责 |
| --- | --- |
| `server/index.js` | Express 入口，初始化快照仓库和图谱，托管前端静态资源 |
| `server/config.js` | 读取 `.env`，导出端口、模型、API key、快照路径 |
| `server/stepfun.js` | 调用 StepFun Chat Completions API，默认 `max_tokens=16384` |
| `server/prompt.js` | system prompt，约束模型输出 JSON、页面图谱语义和 HTML 规范 |
| `server/intent.js` | 组装多模态 messages，解析并修复模型输出 |
| `server/routes.js` | `/api/interact`、`/api/graph`、`/api/navigate`、`/api/history/:nodeId`、`/api/revert`、`/api/sync` |
| `server/graph.js` | 读写页面图谱，管理节点、当前位置和面包屑 |
| `server/snapshots.js` | 使用 simple-git 管理节点 HTML 的版本历史 |

### 3.4 前端模块

| 模块 | 职责 |
| --- | --- |
| `public/index.html` | 应用主壳，包含控制栏、舞台、overlay、图谱面板、状态栏 |
| `public/css/main.css` | 深色玻璃拟态、霓虹风格、布局和交互视觉 |
| `public/js/main.js` | 应用编排：交互事件 → API → 渲染 → 更新图谱和状态 |
| `public/js/api.js` | 封装后端 API 请求 |
| `public/js/stage.js` | sandbox iframe 渲染，支持整页渲染和 patch |
| `public/js/graph.js` | 渲染面包屑、节点树、版本列表，处理导航和回退 |
| `public/js/interactions/index.js` | 注册 pointer、voice、vision、AR 交互模块 |
| `public/js/interactions/pointer.js` | 点击、长按、滑动、捏合、框选、圈选 |
| `public/js/interactions/voice.js` | 麦克风录音转 base64 并发送 |
| `public/js/interactions/vision.js` | 摄像头取帧转 jpeg base64 并发送 |
| `public/js/interactions/ar.js` | WebXR AR 能力检测、会话启动和选择事件，失败时明确提示并复用视觉模块 |

### 3.5 模型输出契约

模型应输出纯 JSON：

```json
{
  "shouldUpdate": true,
  "action": "create",
  "nodeId": "guangzhou_map",
  "parentId": "main",
  "title": "广州旅游地图",
  "intent": "创建广州旅游地图页面",
  "reasoning": "用户请求新主题，需要创建子页面",
  "mode": "full",
  "html": "<div>...</div>",
  "patches": []
}
```

字段含义：

- `shouldUpdate`：是否改变界面。
- `action`：`stay` 更新当前节点，`navigate` 跳转已有节点，`create` 创建子节点。
- `nodeId`：目标或新建节点 id。
- `parentId`：新建子节点来源。
- `title`：用于面包屑和节点树展示。
- `intent`：模型理解的用户意图。
- `reasoning`：模型决策原因。
- `mode`：`full` 表示整页 HTML，`patch` 表示增量 DOM patch。
- `html`：整页 HTML 片段，不含 `<html>`、`<head>`、`<body>`。
- `patches`：patch 模式的 DOM 修改列表。

## 4. 功能设计

### 4.1 文本生成页面

用户在输入框输入自然语言，例如“做一张北京旅游地图”。前端发送：

```json
{
  "type": "text",
  "text": "做一张北京旅游地图"
}
```

后端将其与当前节点、当前 HTML 摘要、已有节点列表一起发给模型。模型通常返回 `action=create`，后端创建新节点、提交 HTML，并返回给前端渲染。

### 4.2 页面探索与子页生成

模型生成的 HTML 中，可探索元素需要带：

```html
data-explorable="1" data-label="广州塔"
```

iframe 内部脚本会把 pointer 事件通过 `postMessage` 转发到父窗口。父窗口归一化为 `tap`、`longpress`、`swipe` 等交互事件，发送给模型。模型根据命中元素和当前页面上下文判断是 `create` 子页、`navigate` 已有页，还是 `stay` 更新当前页。

### 4.3 图谱导航

用户可以通过前端图谱面板或面包屑直接导航到已有节点。

后端接口：

- `GET /api/graph`：返回完整图谱、当前 HTML 和面包屑。
- `POST /api/navigate`：切换到指定节点。

导航不会产生新的 HTML commit，只读取已有节点最新 HTML。

### 4.4 Git 版本历史

每次 `create` 或 `stay` 会调用 `commitNode`：

- 写入 `snapshots/pages/<nodeId>.html`。
- 把 `graph.json` 一并纳入提交。
- commit message 格式为 `[{action}] {title}: {intent}`。

版本相关接口：

- `GET /api/history/:nodeId`：查看节点版本历史。
- `POST /api/revert`：把节点回退到指定 git 版本，再提交一个新的 revert commit。

### 4.5 多模态交互

当前支持的交互采集：

- 鼠标/触摸点击：`tap`。
- 长按：`longpress`。
- 滑动：`swipe`，带方向。
- 双指缩放：`pinch-in` / `pinch-out`。
- Shift 框选：`select-rect`。
- Alt 圈选：`select-lasso`。
- 语音：`voice`，带 base64 音频。
- 摄像头：`vision`，带 base64 jpeg。
- AR：`ar-select`，实验性 WebXR 选择事件。

### 4.6 异常与降级设计

异常处理原则：

- API key 缺失：直接报错，提示配置 `.env`。
- 模型/网络失败：返回 502，前端状态栏提示。
- 模型 JSON 非法且不可恢复：`shouldUpdate=false`，不修改图谱，不提交 git。
- 模型 JSON 字段损坏但可恢复：返回 `error` 警告，继续应用，并在服务端日志标注为模型输出 bug。
- navigate 到不存在节点：不跳转，返回当前节点 HTML 和 `navWarning`。
- 麦克风/摄像头/WebXR 不可用：明确提示，不静默失败。

### 4.7 性能与交互意图路由

生成速度是核心体验指标。项目当前将交互分成两条路径：

1. 本地原生交互
   - 适用：当前 HTML 已经能处理的操作，例如 3D 拖拽/滑动/缩放、2D 地图平移缩放、卡片筛选、沉浸场景背景点击或滑动。
   - 行为：前端直接处理，不调用模型，不改图谱，不生成新版本。
   - 目标：把高频操作体感延迟控制在毫秒级。
2. 模型生成交互
   - 适用：需要改变内容结构、细化当前页、创建子页或跳转节点的操作。
   - 行为：调用 `/api/interact`，后端记录耗时，模型返回决策并应用到 Page Graph。

当前前端路由策略：

- `local_native`：本地已处理，不触发模型。
- `refine_current`：优先 `stay`，用于“当前页加层、换风格、聚焦区域、补充标注”等。
- `create_or_navigate`：用于“进入详情、打开专题、展开新对象、生成新页面”等。
- `model_decide`：语义模糊时交给模型，但提示其先判断 stay/create/navigate。

当前耗时统计：

- 前端状态栏展示端到端耗时、服务端总耗时和模型耗时。
- 后端 `/api/interact` 输出 timing 日志，包含 `totalMs`、`contextMs`、`messageMs`、`modelMs`、`parseMs`、`applyMs`。
- API 响应包含 `timing` 字段，便于端到端验证脚本读取。
- create/stay 的快照提交已改成异步：请求内先写 HTML 和图谱状态并立即返回，git commit 进入后台串行队列。
- 前端收到 `snapshot.mode=async` 时显示“快照后台保存中”，避免用户等待 git commit 完成才看到页面。
- 后端为每次异步快照生成 `snapshot.jobId`，并提供 `GET /api/snapshot-jobs/:jobId` 查询 `pending/done/failed`、`elapsedMs`、`commit` 和错误信息。
- 前端收到 `snapshot.jobId` 后轮询任务状态，状态栏会从“快照后台保存中”更新为“快照已保存 · elapsedMs · hash”或“快照保存失败 · error”。
- `simple-git` 偶发提交成功但返回空 `commit` 字段时，后端会用 `git rev-parse HEAD` 回读最新提交号，避免前端显示 `no-hash`。
- patch stay 路径不再由 `/api/interact` 提交中间 HTML；后端返回 `snapshot.mode=deferred-sync`，前端应用 patch 后调用 `/api/sync`，再由 `/api/sync` 异步提交最终 HTML。
- patch 应用前会保留当前 HTML，应用时校验 patch 列表、selector、action、命中目标和应用后 body 内容；失败时立即回滚旧 HTML，不调用 `/api/sync`，并在状态栏显示“patch 应用失败，已回滚”。

示例日志：

```text
[timing] interact type=text action=create node=earthrise_scene applied=true total=8234ms model=8010ms parse=1ms apply=40ms
```

验收标准：

- 当前页原生交互不应出现 loading，不应调用模型。
- 模型生成路径必须能看到端到端耗时和模型耗时。
- 细化当前页请求应优先 `stay`，进入详情/专题请求才 `create` 或 `navigate`。
- 异步快照后，`applyMs` 应显著下降；服务端日志应出现 `[snapshot] async commit done`。
- 异步快照任务应能被查询到最终状态；浏览器状态栏应能展示保存成功或失败，而不是一直停留在“后台保存中”。
- patch stay 请求应出现 1 次 `/api/sync`，且版本历史只记录最终 HTML 的 `[sync]` 提交，不应记录旧 HTML 或中间 HTML 的重复快照。
- 坏 patch 不应污染 iframe 当前页面，不应触发 `/api/sync`，也不应产生 git 快照提交。

### 4.8 体验范式预设

为降低模型自由生成导致的风格漂移和表现失真，当前在 system prompt 中预置 4 套体验范式，由模型先选范式，再在范式内生成页面：

1. 沉浸多媒体阅读
   - 场景：画面、故事、第一视角、纪录片感、氛围体验、镜头感请求。
   - 结构：全屏/大幅主视觉、分镜式滚动、少量旁白、热点、动态背景、视差。
   - 验收：首屏视觉面积至少 75%，文字不超过 15%。
2. 卡片浏览
   - 场景：攻略、清单、合集、对比、筛选、路线推荐。
   - 结构：卡片网格、滑轨、标签、摘要、封面图、点击钻取。
   - 验收：至少 6 个可区分内容单元，卡片可点击。
3. 2D 可视化交互
   - 场景：地图、流程图、时间线、关系网络、二维数据分布。
   - 结构：SVG/canvas/DOM 节点、平面拓扑、连线、tooltip、缩放、框选。
   - 验收：必须有明确二维结构和交互反馈。
4. 3D 可视化交互
   - 场景：地球、空间站、天体、建筑、展厅、空间结构、可旋转模型。
   - 结构：CSS 3D / 伪 3D / canvas 场景、景深、旋转、热点、鼠标/重力感应。
   - 验收：必须体现空间层次，不能退化成普通 2D 卡片页。

当前实现方式：

- 第一阶段只在 prompt 中固化体验范式和选择规则，不改变现有 JSON 契约。
- 模型继续输出 `shouldUpdate/action/nodeId/.../html`，由后端按原逻辑处理。
- 后续可继续升级为“范式模板 + 内容参数”的 DSL 化生成，进一步提高稳定性。

## 5. 开发情况与实现进度

### 5.1 已完成

- 项目骨架已创建。
- `.env` 已支持 API key 配置。
- Express 服务已能启动。
- StepFun API 调用已跑通。
- 前端主壳、控制栏、sandbox iframe、图谱面板、状态栏已实现。
- 文本交互链路已跑通。
- 鼠标/触摸/手势采集模块已实现。
- 语音录制模块已实现。
- 摄像头视觉模块已实现。
- WebXR AR 实验模块已实现能力检测和 select 事件。
- Page Graph 持久化已实现。
- git 快照仓库和节点版本历史已实现。
- 手动导航、面包屑、版本历史、回退接口已实现。
- 模型 JSON 损坏的鲁棒解析已增强。
- 已加入结构化体验范式库 `server/presets.js`。
- 已加入第一版交互意图路由，减少高频本地交互触发模型生成。
- 已加入前后端耗时统计：前端状态栏展示，后端日志记录，API 响应返回 `timing`。
- 已加入异步快照提交队列，create/stay 不再等待 git commit 完成才响应。
- 已加入异步快照任务状态闭环：`commitNodeAsync()` 返回 `jobId`，后端保存内存态任务状态，前端轮询 `/api/snapshot-jobs/:jobId` 并展示保存中/已保存/失败。
- 已将 patch 模式的 `/api/sync` 改为异步快照任务，避免小改动路径重新阻塞前端，并避免 `/api/interact` 阶段提交中间 HTML。
- 已加入 patch guard：`stage.applyPatchesSafely()` 在应用失败或应用后页面为空时自动回滚，前端不会同步坏结果。
- 已加入可复用浏览器端到端脚本 `scripts/e2e.mjs`，可通过 `npm run e2e` 验证核心体验闭环。
- 文档计划和本总文档已落盘。

### 5.2 已验证

真实接口验收结果：

- `/api/status` 返回 `hasApiKey=true`。
- StepFun 直连测试返回 HTTP 200。
- “做一张北京旅游地图”成功创建 `beijing_map`。
- 从 `beijing_map` 输入“点击天安门”成功创建 `beijing_tiananmen`。
- 当前图谱包含 `main`、`guangzhou_map`、`canton_tower`、`beijing_map`、`beijing_tiananmen`。
- 面包屑可正确显示 `主页 > 北京旅游地图 > 天安门广场`。
- `beijing_tiananmen` 的 git 历史包含 `[create] 天安门广场: 查看天安门广场详细信息`。
- `server/intent.js` 诊断无错误。
- 全局 diagnostics 当前无错误。
- `node --test server/intent.test.js` 已通过，覆盖 `nodeId=create` 等解析损坏样本。
- API 级生成链路可读取 `timing.totalMs/modelMs/parseMs/applyMs`。
- 浏览器级端到端验证已通过：在 `earth_3d_showcase` 页面点击 3D canvas 背景，`/api/interact` 请求数为 0，状态栏显示“当前 3D 场景已原生处理 点击，未触发重新生成 · 本地耗时 0ms”。
- 异步快照性能验证已通过：同类 `refine_current` 请求中 `applyMs` 从历史约 `23114ms` 降至 `14ms`，`totalMs≈7391ms`，后台 git commit 约 `15500ms` 后完成。
- 快照任务状态 API 验证已通过：`/api/interact` 返回 `snapshot.jobId=snap_1780728682866_1`，轮询 `/api/snapshot-jobs/:jobId` 从 `pending` 收敛到 `done`，示例 `applyMs=2ms`、后台任务 `elapsedMs=376ms`、`commit=48d631bb`。
- 浏览器级快照状态验证已通过：输入当前页细化请求后，状态栏先显示“快照后台保存中”，随后显示“快照已保存 · 2350ms · 712ba5d0 · 耗时：端到端 11219ms / 服务端 11215ms / 模型 11213ms”；本次产生 1 次 `/api/interact` 和 3 次 `/api/snapshot-jobs` 请求。
- 快照 hash 回读修复已验证：当 `simple-git` 的 `commit()` 返回空 hash 时，后端能回读 `HEAD` 并在任务状态中返回 8 位以上提交号，避免前端显示 `no-hash`。
- `npm run e2e` 已通过：脚本确认服务可用、快照状态栏从“快照后台保存中”更新为“快照已保存 · 185ms · 1cb6c45d”，并确认 3D 场景背景点击 `/api/interact` 请求数为 0。
- patch sync 异步路径已通过 E2E：脚本捕获 `sync requests: 1`，状态栏显示“快照已保存 · 175ms · 7a751ca9”，服务端 `/api/interact` 的 `applyMs=1ms`，快照仓库最新提交为 `[sync] earth_3d_showcase`。
- patch guard 已通过 E2E：脚本注入会清空页面的坏 patch，输出 `bad patch guard ok` 和 `bad patch error: patch 后页面内容为空`；快照历史确认坏 patch 未产生额外提交。

### 5.3 部分完成或待加强

- `patch` 模式路径已覆盖当前页细化后的 `/api/sync` 异步提交，并已加入基础坏 patch 回滚保护；复杂 patch 的语义正确性仍依赖模型输出质量，后续需要更多坏 patch 和复杂 patch 的回归样本。
- 语音音频格式存在浏览器兼容差异，StepFun 文档更偏 mp3/wav，浏览器可能产出 webm。
- AR 目前偏能力检测和事件入口，尚未实现完整 AR 场景渲染。
- 图谱目前主要是父子树，尚未实现多类型关联边。
- nodeId 冲突处理目前较基础，重复节点由 `graph.addNode` 更新已有节点标题，尚未生成自动序号。
- 四套体验范式当前仍依赖 prompt 约束，尚未沉淀为可复用的前端模板、样式基线和组件 DSL。
- 浏览器级端到端自动化验证已沉淀为项目脚本；MCP Playwright 浏览器缓存依赖仍需单独修复。
- iframe 桥接脚本已前置到 `<head>`，避免模型生成片段中的脚本/标签错误影响 pointer 转发和 capabilities 上报。

## 6. 当前存在的问题

### 6.1 模型 JSON 输出不稳定

已观察到 `step-3.5-flash` 在 `response_format: { type: "json_object" }` 下仍会偶发以下问题：

- 字段名丢失，例如前几个 key 变成空字符串或异常字符。
- 字段名污染，例如 `nodeId{`、`parentId{`。
- 字段值污染，例如 `tiananmen{`。
- 缺失 `shouldUpdate`。
- 自然语言替代 JSON，例如 `.create beijing_map under main`。
- HTML 太长导致 JSON 截断。

当前处理：

- `parseHybridOutput` 对这些模式做了恢复。
- 能恢复时继续应用，但会返回 `error` 并记录日志。
- 不能恢复时 `shouldUpdate=false`，不提交，不改图谱。

风险：

- 恢复逻辑是启发式的，不能保证覆盖所有模型异常输出。
- 如果模型把语义严重错位，后端可能只能阻止更新，无法自动修正业务意图。

建议：

- 升级到 `json_schema strict`。
- 拆成两阶段调用：第一阶段只返回严格决策 JSON；第二阶段根据已确定的决策生成 HTML。
- 或改成“模型只输出 DSL，后端模板生成 HTML”，进一步降低输出长度和结构错误。

### 6.2 HTML 生成长度和质量不稳定

问题：

- 模型生成的 HTML 可能过长。
- 长 HTML 容易导致 JSON 字符串截断。
- 生成内容质量受模型状态和 prompt 影响。
- 画面型请求可能被模型错误理解成信息型网页，导致“用户想看画面”却生成“标题 + 图片 + 大段文字卡片”的百科式页面。

当前处理：

- 默认 `max_tokens` 提升到 16384。
- prompt 要求 `html` 控制在 5000 字符以内。
- 截断 JSON 尝试补全；补全失败则不应用。
- prompt 已增加“意图分类与表现策略”：画面型/场景型请求必须以沉浸式视觉为主体，首屏 75% 以上面积用于大画面、背景图、CSS 场景、3D/伪 3D、粒子、光影和视差层；文字最多作为短标题、镜头标注或热点标签。
- prompt 已增加“宇航员在空间站回望地球”示例，明确应生成空间站舷窗、地球弧面、云层、大气蓝边、星空、太阳光晕、漂浮感、鼠标/重力视差等视觉场景，而不是文字说明页。
- prompt 已禁止模型输出 `style="{...}"`、`src="{...}"` 这类被花括号污染的 HTML 属性。

建议：

- 引入页面模板或组件 DSL。
- 将长内容拆为多个子节点，首屏只保留核心信息。
- 前端对 HTML 做安全和质量检查后再渲染。

### 6.3 安全边界仍需强化

当前通过 sandbox iframe 隔离模型生成 HTML/JS，但仍需后续加强：

- 限制 iframe sandbox 权限。
- 检查内联脚本是否尝试越权。
- 限制外链资源域名。
- 过滤危险协议和事件属性。
- 防止模型生成钓鱼式 UI 或恶意跳转。

### 6.4 多模态兼容性不确定

问题：

- 语音格式可能是 `audio/webm`，模型侧不一定稳定支持。
- 摄像头权限受浏览器和系统设置影响。
- WebXR AR 主要依赖移动端和浏览器能力，桌面环境通常不可用。

当前策略：

- 模块独立失败，互不影响主文本链路。
- 用户可见错误提示。

### 6.5 状态一致性和并发仍需完善

当前前端用 `busy` 防止同一客户端重复提交，但后端仍缺少更完整的并发保护：

- 多标签页同时交互可能导致 `graph.current` 被覆盖。
- 多用户并发未设计。
- 高频交互可能造成模型请求风暴。
- 快照任务状态当前保存在进程内存中，服务重启后历史 `jobId` 会丢失；这属于可观测性和恢复能力问题，不应视为正常业务状态。

建议：

- 引入 sessionId 或 clientId。
- 后端按 session 维护 current node。
- 增加请求队列、节流和幂等 ID。
- 将 `snapshotJobs` 持久化到轻量日志或 `snapshots/jobs.jsonl`，服务重启后可以查询最近任务状态或给出明确的“服务重启导致任务状态不可恢复”提示。

### 6.6 生成速度与交互误触发

问题：

- 如果每次点击、拖拽、滑动都触发模型生成，体感会很慢，也会污染 Page Graph。
- 3D/2D/卡片页面中，大量交互本应由当前 HTML 原生处理。
- 文本意图也需要区分“细化当前页”和“进入新页面”。

当前处理：

- `public/js/stage.js` 从 iframe 页面中推断或读取 `__AIOUX_CAPABILITIES__`。
- `public/js/main.js` 使用 `routeInteraction()` 将本地交互拦截在前端。
- `server/intent.js` 将 `intentHint` 和当前页能力带给模型，指导其优先 `stay` 或 `create/navigate`。
- `/api/interact` 记录并返回 timing，用于观察真实耗时。
- iframe 桥接脚本前置执行，保证即使模型生成 HTML 中存在局部脚本错误，也尽量不影响父子窗口事件转发。
- create/stay 已采用异步快照任务：请求内写 HTML 和图谱后立即响应，后台串行 git commit，并通过 `snapshot.jobId` 反馈最终状态。
- patch stay 已采用 deferred sync：`/api/interact` 只返回 patches，不提交中间 HTML；前端应用 patch 后调用 `/api/sync`，由 `/api/sync` 异步提交最终 HTML 并反馈 `snapshot.jobId`。
- patch guard 已覆盖空 patch、缺少 selector、未知 action、selector 未命中、应用后 body 为空等明显坏样本；失败时回滚旧 HTML，并阻断 `/api/sync`。

仍需改进：

- 当前路由规则仍是启发式，复杂文本意图仍可能误判。
- 本地交互和热点探索的边界需要更多真实页面验证。
- 后续建议把范式模板、能力声明和交互控制器绑定起来，避免靠 DOM 推断。
- 曾有一次 API 级验证显示 `modelMs≈4.8s`，但 `applyMs≈23s`。当前已将 create/stay 和 patch sync 快照提交改为后台异步队列，最新 patch E2E 验证 `applyMs=1ms`、sync 后台提交 `175ms`；后续仍需优化 git 仓库体积、提交策略和 no-op 更新识别。
- patch guard 当前是结构级保护，尚不能判断“视觉上很丑但语法有效”或“语义上改错了区域”的 patch；这类问题仍需要更强的模型契约、DOM diff 预览或用户确认机制。

## 7. 后续开发建议

### 7.1 高优先级

- 将模型调用拆成“决策 JSON”和“HTML 生成”两阶段。
- 使用 `json_schema strict` 固化决策字段。
- 为 `parseHybridOutput` 增加单元测试，覆盖已出现的坏 JSON 样本。
- 增加 nodeId 冲突自动去重，例如 `beijing_map_2`。
- 完善 navigate 到不存在节点时的恢复策略。
- 将四套体验范式升级为前端模板系统，让模型输出“范式 + 内容参数 + 交互配置”，而不是直接自由拼整页 HTML。
- 继续扩展浏览器端到端测试脚本，持续验证热点点击会触发 create/navigate、当前页细化会 stay、patch sync 会提交最终 HTML、坏 patch 会回滚且不提交、异步快照任务能从 pending 收敛到 done/failed。

### 7.2 中优先级

- 把模型生成 HTML 改为组件 DSL 或受控模板。
- 增强前端安全过滤。
- 增加操作 trace 面板，展示每次模型决策、原始输出、修复记录和 git commit。
- 增加导出/导入图谱能力。
- 完善 `patch` 模式的语义级 diff 检测、预览和回滚策略，让小改动既不需要整页重绘，也不会在 patch 失败或改错区域时污染页面状态。
- 持久化快照任务状态，避免服务重启后 `jobId` 查询丢失。

### 7.3 低优先级

- 接入图片生成模型生成定制化素材。
- 支持更多边类型，例如 related、sibling、reference。
- 支持多人协作或云端部署。
- 支持更完整 AR 场景。

## 8. 当前运行方式

安装依赖：

```bash
npm install
```

配置 `.env`：

```bash
STEPFUN_API_KEY=你的key
PORT=3000
STEP_MODEL=step-3.5-flash
```

启动：

```bash
npm start
```

访问：

```text
http://localhost:3000
```

运行浏览器端到端验证：

```bash
npm run e2e
```

端到端脚本说明：

- 运行前需要先启动本地服务，默认访问 `http://localhost:3000`。
- 可用 `AIOUX_BASE_URL` 覆盖服务地址。
- 可用 `AIOUX_E2E_3D_NODE` 覆盖用于本地 3D 交互验证的节点，默认 `earth_3d_showcase`。
- 覆盖范围：patch sync 异步保存闭环、坏 patch 回滚保护、`/api/snapshot-jobs/:jobId` 轮询、3D 背景点击不触发模型生成。

## 9. 验收用例建议

### 9.1 基础链路

- 输入“做一张广州旅游地图”，期望创建 `guangzhou_map`。
- 点击“广州塔”，期望创建 `canton_tower` 或等价子节点。
- 点击面包屑“主页”，期望返回 `main`。
- 查看节点版本历史，期望存在对应 git commit。
- 当前页细化请求返回后，期望状态栏先显示“快照后台保存中”，随后显示“快照已保存 · elapsedMs · hash”。
- 直接请求 `GET /api/snapshot-jobs/:jobId`，期望返回 `pending`、`done` 或 `failed`，完成态包含 `elapsedMs`，成功态包含 `commit`。
- 执行 `npm run e2e`，期望脚本输出 `snapshot status ok`、`sync requests: 1`、`bad patch guard ok` 和 `local 3D interaction ok`。

### 9.2 模型异常链路

- 模拟缺失 `shouldUpdate`，期望后端从 HTML 或 patches 推断。
- 模拟 `nodeId{` 字段名，期望修复为 `nodeId`。
- 模拟 HTML 被放入 `nodeId`，期望移动到 `html`。
- 模拟截断 JSON，期望能恢复则恢复，不能恢复则 `shouldUpdate=false`。
- 模拟 navigate 到不存在节点，期望不跳转并提示。

### 9.3 多模态链路

- 语音输入“生成上海旅游路线”，期望模型理解语音意图。
- 摄像头拍摄某物并输入“基于画面生成介绍页”，期望模型结合图片。
- Shift 框选页面区域，期望发送 `select-rect`。
- Alt 圈选页面区域，期望发送 `select-lasso`。
- 双指缩放，期望发送 `pinch-in` 或 `pinch-out`。

## 10. 交接摘要

项目当前已经具备一个可运行的生成式 UX Demo 雏形。最重要的架构成果是：从单页版本历史升级为 Page Graph，每个页面节点有稳定身份和 git 历史。当前最大技术风险不是前后端链路，而是模型在 `json_object` 模式下的输出结构稳定性。代码已经通过 prompt、解析器和显式告警做了补强，但后续应优先用 `json_schema strict` 或两阶段调用彻底降低该风险。
