# AIOUX 项目需求、架构、功能与进度总文档

> 更新时间：2026-06-08
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
- 后续需要与其他 agent 协作，所有代码或文档改动必须先在独立分支开发、验证无冲突后再通过 PR 合入主线，避免分支污染和冲突。

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

### 3.4 分支协作工作流

为支持多 agent 协作并避免主线污染，项目采用以下协作约束：

- `main` 始终保持可运行、可测试、可同步远端的稳定状态。
- 每个任务从最新 `main` 新建独立分支，分支名按目标命名，例如 `docs/collaboration-branch-workflow`、`fix/snapshot-queue-atomicity`、`test/e2e-isolated-snapshots`。
- 每个分支只承载一个清晰目标；若预计修改超过 3 个文件，先拆成更小任务再实施。
- 分支内先完成本地验证，包括相关单元测试、端到端验证、`git status` 检查和必要的冲突检查。
- 合入主线前使用 GitHub PR（Pull Request，合并请求）进行合并；PR 合入后删除临时分支并回到最新 `main`。
- 不在远端直接修改代码；所有改动先在本地分支完成、验证、提交，再推送远端。
- 遇到架构、安全、核心逻辑策略调整时，先说明风险和可能影响，等待确认后再写代码。
- 核心逻辑禁止把失败伪装成正常降级；可以记录错误并临时保护现场，但必须标注为待修复 bug。

### 3.5 前端模块

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

### 3.6 模型输出契约

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

## 3.7 核心模块架构愿景

> 本节是后续开发的纲领。系统价值集中在四个核心模块，外加一个贯穿所有模块的核心非功能指标：响应速度。

整体目标：在不同场景下，通过不同的标准 skill 生成高质量网页，并让素材、记忆、意图协同提升体验与速度。

### 3.7.1 模块一：意图（Intent）

- 职责：判断用户每次交互的真实意图，区分本地原生交互与需要模型生成的交互，并在生成时区分 stay/create/navigate 以及场景类型。
- 现状：前端 `routeInteraction()` 启发式路由 + 后端 `intentHint` + 模型决策；已具备本地原生交互拦截。
- 目标：建立可回放意图样本集和误判率指标，降低误触发模型、误判场景类型、误判 stay/create/navigate 的概率。
- 关联分支：`feature/intent-routing-evaluator`。

### 3.7.2 模块二：素材搜集与维护（Assets）

- 职责：为生成的网页提供高质量素材，包括图片、icon、视频、3D 模型等；来源包括联网搜索（天气、美食、城市图片等）和本地素材库。
- 策略：允许引用白名单外链素材（图片/icon/视频/3D 模型/CDN 库），不再要求页面完全自包含；同时维护本地素材，减少重复检索和外链失效风险。
- 关键能力：素材检索、素材白名单校验、素材缓存与复用、失效兜底（外链不可用时降级到本地或占位策略，并记录为待解决问题而非正常态）。
- 关联：与记忆模块强相关，素材的复用和偏好沉淀依赖记忆模块。

### 3.7.3 模块三：记忆（Memory）

- 职责：维护所有生成过的网页、内容、素材，以及用户偏好，用于跨会话提升体验。
- 现状：Page Graph + snapshots git 历史已经持久化页面与版本；尚无显式的素材记忆和用户偏好记忆。
- 目标：在 Page Graph 与快照之上，增加素材索引、用户偏好画像（如偏好的视觉风格、常用场景、对动效/3D 的偏好）和复用机制。
- 关联：与素材模块共享素材索引；为意图和前端生成提供个性化上下文。

### 3.7.4 模块四：前端生成（Generation）

- 职责：在不同场景通过不同的标准 skill（如 frontend-design、gsap-*、three.js/3D、UI 动画等）生成高质量网页。
- 设计：通过通用的「skill → preset 适配层」把任意 skill 的方法论萃取为标准化预设变体，而不是特异性硬融合某一两个 skill。
- 扩展性：新增或更新 skill 时，只需新增/更新一个 adapter 条目，不改生成主流程；同一场景可并存多个变体（如 3D 的纯 CSS 轻量版、three.js WebGL 版、GSAP 强动效版），满足更细分或更个性化的需求。
- 关联分支：`feature/preset-registry`（底座）、`feature/preset-3d-variants`、`feature/preset-2d-immersive-card-variants`。

### 3.7.5 贯穿指标：响应速度（Latency）

- 定位：游离在四个模块之外，但同等重要，是核心用户体验指标。
- 现状：已建立 `traceId` 和全流程结构化 timing 埋点（本地路由、API 往返、渲染、patch、sync、快照）。
- 目标：基于 timing 数据建立延迟预算，识别慢路径（模型耗时、素材检索耗时、渲染耗时、快照耗时），并持续优化。
- 原则：核心逻辑失败禁止伪装成正常降级；可记录错误并临时保护现场，但必须标注为待解决问题。

### 3.7.6 模块协同关系

- 意图决定是否生成、生成什么场景，影响素材检索范围和前端生成预设选择。
- 素材与记忆共享素材索引：记忆记录用过的素材和偏好，素材模块据此优先复用。
- 记忆为意图和前端生成提供个性化上下文，提升体验。
- 前端生成消费意图、素材、记忆，产出页面；产出又回写记忆。
- 响应速度贯穿全链路，由 timing 埋点统一观测。

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
- patch 应用前新增 diff 风险评分：检测根节点修改、疑似清空主体、脚本/事件属性注入、大范围 remove/replace、注入内容过大等风险；高风险 patch 在 DOM 写入前被阻断。

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
- 高风险 patch 应在预检阶段失败，错误信息应包含具体风险原因，例如“疑似清空页面主体”或“破坏性改动范围过大”。

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
- 已加入 patch diff 风险评分：`stage.js` 会在真正改写 DOM 前评估 patch 风险，高风险变更直接阻断。
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
- patch diff 风险评分已在独立分支 `feature/patch-diff-risk-scoring` 验证通过：`npm run e2e` 输出 `bad patch error: patch 风险过高: 疑似清空页面主体: body > *；破坏性改动范围过大: 1/1`，正常 patch 仍可保存为 `be612589`。

### 5.3 部分完成或待加强

- `patch` 模式路径已覆盖当前页细化后的 `/api/sync` 异步提交，并已加入基础坏 patch 回滚保护和结构级 diff 风险评分；复杂 patch 的语义正确性仍依赖模型输出质量，后续需要更多坏 patch 和复杂 patch 的回归样本。
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
- `feature/timing-observability` 第一阶段补充了 `traceId` 和结构化 timing 日志：后端 `/api/interact`、`/api/sync` 输出 JSON timing，前端记录本地路由、API 往返、整页渲染、patch 风险评估、patch 应用和 sync 往返耗时。
- iframe 桥接脚本前置执行，保证即使模型生成 HTML 中存在局部脚本错误，也尽量不影响父子窗口事件转发。
- create/stay 已采用异步快照任务：请求内写 HTML 和图谱后立即响应，后台串行 git commit，并通过 `snapshot.jobId` 反馈最终状态。
- patch stay 已采用 deferred sync：`/api/interact` 只返回 patches，不提交中间 HTML；前端应用 patch 后调用 `/api/sync`，由 `/api/sync` 异步提交最终 HTML 并反馈 `snapshot.jobId`。
- patch guard 已覆盖空 patch、缺少 selector、未知 action、selector 未命中、应用后 body 为空等明显坏样本；失败时回滚旧 HTML，并阻断 `/api/sync`。
- patch diff 风险评分已覆盖根节点修改、疑似清空主体、脚本/事件属性注入、大范围破坏性修改和超大内容注入；风险过高时在 DOM 写入前阻断。
- patch 安全应用现在返回 `patchValidateMs`、`patchRiskMs`、`patchApplyMs`、`patchDocumentValidateMs`、`patchRollbackMs`、`patchTotalMs`，方便后续定位 patch 慢点或误拦截。

仍需改进：

- 当前路由规则仍是启发式，复杂文本意图仍可能误判。
- 本地交互和热点探索的边界需要更多真实页面验证。
- 后续建议把范式模板、能力声明和交互控制器绑定起来，避免靠 DOM 推断。
- 曾有一次 API 级验证显示 `modelMs≈4.8s`，但 `applyMs≈23s`。当前已将 create/stay 和 patch sync 快照提交改为后台异步队列，最新 patch E2E 验证 `applyMs=1ms`、sync 后台提交 `175ms`；后续仍需优化 git 仓库体积、提交策略和 no-op 更新识别。
- patch guard 与 diff 风险评分当前仍是结构级保护，尚不能判断“视觉上很丑但语法有效”或“语义上改错了区域”的 patch；这类问题仍需要更强的模型契约、DOM diff 预览或用户确认机制。

### 6.7 2026-06-08 主线 review 发现

本次 review 覆盖近期主线差异与关键架构文件，完整报告位于 `/tmp/AIOUX_review_plan_20260608/report.html`。当前需优先处理以下风险：

- `server/snapshots.js` 的 `commitNodeAsync()` 只串行化了 git commit，但 `writeNodeHtml()` 在入队前执行；连续提交同一节点时可能出现前一个任务提交后一个 HTML 的串版本问题。该项已在 `fix/snapshot-queue-atomicity` 分支修复并补充回归测试。
- `public/index.html` 中 sandbox iframe 同时允许 `allow-scripts` 和 `allow-same-origin`，而生成页面允许内联脚本；这会削弱隔离边界。该项属于安全和渲染架构策略改动，实施前需要单独确认。建议分支：`security/sandbox-isolation-protocol`。
- `scripts/e2e.mjs` 当前会把真实当前节点写入 E2E fixture HTML，可能污染用户演示快照。后续修复分支：`test/e2e-isolated-snapshots`。
- patch 风险评分目前是结构级保护，还缺少预览、确认、语义风险说明和可观测日志。建议分支：`feature/patch-preview-risk-ui`。
- 意图路由仍以启发式规则为主，缺少可回放样本集和误判率指标。建议分支：`feature/intent-routing-evaluator`。

## 7. 后续开发建议

### 7.1 高优先级

- 以 `feature/timing-observability` 作为意图路由和视觉质量优化的观测底座；后续 `feature/intent-routing-evaluator` 和 `feature/visual-quality-evaluator` 应复用 `traceId` 与结构化 timing 日志。
- 快照异步队列原子性已在 `fix/snapshot-queue-atomicity` 分支修复：把“写 HTML + git add + commit”作为同一串行临界区，并补充同节点连续 `commitNodeAsync()` 回归测试。
- 隔离 E2E 快照写入：使用临时 `SNAPSHOTS_DIR`、临时节点或测试后自动清理，避免测试污染真实页面历史。
- 在单独安全分支评估 sandbox 隔离方案：去掉 `allow-same-origin`、使用独立 origin 或更严格的 `postMessage` 白名单协议，并为写接口增加 nonce 校验。
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
- 覆盖范围：patch sync 异步保存闭环、坏 patch 回滚保护、`/api/snapshot-jobs/:jobId` 轮询、3D 背景点击不触发模型生成。
- E2E 中的 patch sync 使用确定性 fixture，不依赖模型每次都返回相同 patch，避免网络或模型输出波动造成误判。
- E2E 中的 3D 本地交互通过模拟 iframe capabilities 和 pointer 消息验证父窗口路由逻辑，不依赖可变的历史页面快照。
- 如需避免 E2E 污染真实 `snapshots/`，可先用临时目录启动服务：`AIOUX_SNAPSHOTS_DIR=$(mktemp -d /tmp/aioux-e2e-snapshots-XXXXXX) PORT=3100 npm start`，再运行 `AIOUX_BASE_URL=http://localhost:3100 npm run e2e`。

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

## 11. 操作日志

### 2026-06-08

- 已确认新增协作规则：后续与其他 agent 协作时，所有开发和测试必须在独立分支完成，验证功能正常且无冲突后再通过 PR 合入主线。
- 已核对主线状态：`main` 与 `origin/main` 同步，工作区干净，无打开 PR。
- 已完成主线 review：发现快照异步队列原子性、sandbox 隔离边界、E2E 快照污染三项优先风险，并生成报告 `/tmp/AIOUX_review_plan_20260608/report.html`。
- 已创建文档分支 `docs/collaboration-branch-workflow`，用于落档协作分支工作流和 review 发现；本分支不修改业务代码。
- 已合入 PR #5，将协作分支工作流、主线 review 风险和操作日志落到 `main`。
- 已创建 `fix/snapshot-queue-atomicity` 分支修复快照异步队列原子性：先新增复现测试确认连续异步提交历史只有 1 条，随后将 `writeNodeHtml()` 移入队列任务内部，确保每个 job 写入并提交自己对应的 HTML。
- 验证记录：`node --test server/snapshots.test.js` 通过；`node --test server/*.test.js` 通过 3/3；使用临时 `AIOUX_SNAPSHOTS_DIR` 和 `PORT=3100` 运行隔离 E2E 通过，临时服务和目录已清理。
- 已创建 `feature/timing-observability` 分支建设耗时观测底座：`/api/interact` 与 `/api/sync` 返回 `traceId` 和更细 timing；前端输出本地路由、远程请求、渲染、patch、sync 的结构化日志；patch 安全路径返回分段耗时。
- 验证记录：`node --test server/*.test.js` 通过 3/3；使用临时 `AIOUX_SNAPSHOTS_DIR` 和 `PORT=3101` 运行隔离 E2E 通过；`GetDiagnostics` 无错误，临时服务和目录已清理。
- 已确认系统四大核心模块与一项贯穿指标：意图、素材搜集与维护、记忆、前端生成，以及响应速度；其中素材与记忆强相关。已在第 3.7 节落档为后续开发纲领。
- 已确认外链策略升级：允许引用白名单外链素材（图片、icon、视频、3D 模型、CDN 库），不再要求页面完全自包含；素材搜集与维护（联网与本地）作为独立核心模块。
- 已确认前端生成采用通用「skill → preset 适配层」，支持同场景多预设变体和未来 skill 的可扩展接入，而非特异性硬融合个别 skill。
- 已创建文档分支 `docs/core-modules-architecture` 落档以上架构愿景；本分支不修改业务代码。
- 已合入 PR #9 `feature/preset-registry`：新增通用「skill → preset 适配层」注册表（`server/presetRegistry.js`），支持同场景多变体、显式/关键词/兜底三级选择，并以现有 4 套范式为种子；新增 `ALLOWED_ASSET_DOMAINS` 外链白名单与 `isAllowedAssetUrl()`；零行为变更。
- 已创建 `feature/preset-integration` 分支把注册表接入生成主流程：新增 `loadPresetVariants()` 自动加载 `server/presets/variants/` 下各自注册的变体文件；`server/index.js` 启动时加载；`server/intent.js` 在 `buildMessages` 中按交互选中变体并注入其 `promptSection`（失败回退通用范式摘要）。新增示例变体 `interactive_3d__threejs_webgl`。
- 设计动机：变体以独立文件存在并自注册，新增场景变体只需新增一个文件，便于多分支/多 subagent 并行开发，互不冲突。
- 验证记录：`node --test server/*.test.js` 通过 10/10；`GetDiagnostics` 无错误；使用临时 `AIOUX_SNAPSHOTS_DIR` 和 `PORT=3102` 启动服务确认变体加载与服务启动正常，隔离 E2E 通过，临时服务和目录已清理。
- 已并行合入 PR #11/#12/#13：3D 多变体（`css3d_lite`、`gsap_motion`）、2D 多变体（`svg_dataviz`、`map_explore`、`timeline_story`）、意图路由抽为纯函数 `public/js/route-interaction.js` + 可回放评测集（23 条样本，按边界类别统计误判）。当前 3D 场景 4 个变体、2D 场景 4 个变体。
- 并行方式：用 3 个 subagent 并行做研究产出，再逐个落到独立分支验证合入；变体以独立文件自注册，分支间零文件重叠、无冲突。

### 2026-06-08 预设体系验收

- 主线全量测试 41/41 通过（`server/*.test.js` + `public/js/route-interaction.test.js`），`GetDiagnostics` 无错误。
- 真实模型生成验收（临时 `AIOUX_SNAPSHOTS_DIR` + `PORT=3104`）：输入“做一个可旋转的真实感地球 webgl 3D 展示”，模型 `create` 了 `earth_3d_webgl`，整页 6083 字符，`modelMs≈17811ms`、`applyMs=2ms`，含 `data-explorable` 热点与外链图片，变体注入链路打通、服务启动加载 3 个变体文件。
- **发现待修复 P1（选择质量 bug，非正常表现）**：上述 query 的变体选择器选中了 `interactive_3d__builtin`（命中宽泛词“地球/旋转/3d”得 3 分）而非专用的 `interactive_3d__threejs_webgl`（命中“webgl/真实感”得 2 分）。内置种子变体关键词过宽，会压制更专用的 skill 变体；且当前选择器只按关键词命中数排序、未考虑变体专精度与 priority 加权，生成结果也未严格遵循被注入变体（本次产出退化为 CSS3D 而非 WebGL）。
  - 后续修复方向（分支 `fix/preset-selection-specificity`）：① 内置种子变体降权或收窄关键词；② 选择器在关键词同分/接近时用 `priority` 与“专用 skill 标识”加权，让专用变体优先；③ 可在评测集中加入“webgl 真实感→threejs 变体”“轻量→css3d 变体”等期望用例，量化选择准确率。

### 2026-06-08 阶段验收（选择器修复后）

- 选择器专精度 P1 已由 PR #15 修复并合入 `main`：引入 `priority*0.5` 加权（`eff = score + priority*0.5`），过滤门槛仍按关键词命中数 `>0`；回归用例断言“webgl 真实感”查询不再选中 `__builtin`。
- 主线全量测试 42/42 通过（`server/*.test.js` + `public/js/route-interaction.test.js`），`GetDiagnostics` 无错误；工作区干净，`HEAD` 与 `origin/main` 同步。
- 当前变体盘点：3D 场景 4 变体（`threejs_webgl`/`css3d_lite`/`gsap_motion`/`builtin`）、2D 场景 4 变体（`svg_dataviz`/`map_explore`/`timeline_story`/`builtin`）；卡片、沉浸场景目前仅有 `builtin` 种子，缺专用变体。
- 观测底座已就位：`traceId` + 全流程 timing 埋点（PR #7）、意图路由纯函数 + 23 条评测集（PR #13）；但变体“选中了哪个/为何选中”尚未回填到 timing 与 API 响应，选择过程不可观测。
- 本轮并行四方向（已确认）：① 卡片/沉浸场景专用变体；② 变体选择可观测（telemetry）；③ 素材模块（联网+本地搜集维护）；④ 记忆模块（页面/素材/偏好索引）。接入方式：后端选变体注入 prompt；并行方式：意图与多场景（2D/3D/卡片/沉浸）多 subagent 并行，变体以独立文件自注册保证零文件冲突。

### 2026-06-08 卡片/沉浸场景专用变体落地（feature/preset-card-immersive-variants）

- 新增卡片场景 2 变体（`server/presets/variants/card_browser_packs.js`）：`card_browser__editorial_grid`（杂志策展式非对称 CSS Grid + @fontsource 特色字体，priority 2）、`card_browser__masonry_gallery`（瀑布流/masonry 画廊图集，priority 2）。
- 新增沉浸场景 2 变体（`server/presets/variants/immersive_media_packs.js`）：`immersive_media__cinematic_scroll`（GSAP ScrollTrigger pin/scrub 电影化分镜滚动叙事，priority 3）、`immersive_media__hero_parallax`（单屏强视觉首屏视差，鼠标/陀螺仪联动，priority 3）。
- 设计要点：字体走 `@fontsource` via `cdn.jsdelivr.net`（已在白名单内，无需扩充白名单）；封面/主视觉优先 `copilot-cn.bytedance.net` text_to_image；hover/视差仅动 transform/opacity 避免重排；均含 `prefers-reduced-motion` 降级；GSAP 失败降级到 IntersectionObserver 并标注为待修复异常。至此四大场景均具备专用变体：3D 4 个、2D 4 个、卡片 3 个、沉浸 3 个。
- 验证记录：新增 `server/presetCardImmersiveVariants.test.js` 7 条用例（注册 + 关键词选中 + 专用变体不被 builtin 压制）全过；`node --test` 全量 49/49 通过；隔离启动（临时 `AIOUX_SNAPSHOTS_DIR` + `PORT=3105`）确认 `[presetRegistry] 变体加载完成 loaded=5`、`/api/status` 正常，临时服务与目录已清理。

### 2026-06-08 素材模块（Assets）自包含落地（feature/asset-service）

- 新建 `server/assets/` 自包含模块（暂不接入主生成流程），文件均 < 200 行：
  - `sources.js`：在线源 URL 构造 + 可注入 fetch 的可达性探测。`buildText2ImageUrl`（imageSize 非法回退 landscape_16_9）、`buildUnsplashKeywordUrl`、`buildIconUrl`（api.iconify.design）、`probeAssetUrl`（HEAD 失败回退 GET、AbortController 超时，显式区分 timeout/bad_status/network_error）。
  - `store.js`：本地库 + 缓存索引。`ASSETS_DIR` 在本文件内解析（读 `AIOUX_ASSETS_DIR`，未改 config.js）；`makeCacheKey`（关键词归一化排序，乱序同键）；`findInLibrary` 关键词打分；`loadCacheIndex/getCached/putCached`（原子写 tmp+rename，损坏重建不抛）。
  - `issues.js`：失效问题记录 `recordAssetIssue` 追加 `issues.jsonl` 返回 issueId（含 `resolved:false`），`listAssetIssues`。
  - `index.js`：门面 `resolveAsset`（本地→缓存→在线→降级，每步 timingMs）、`resolveAssets`（并发上限 4）、`validateAssetUrl`（薄封装 isAllowedAssetUrl）。
- 失效兜底严格不伪装：所有失败路径返回 `degraded:true` + `issueId` 并写 `issues.jsonl`，兜底用内联 data-URI SVG 占位；video/model 类型无源时明确返回不支持而非伪装成功。
- 来源策略：首版不引入需 key 的图床 API、不扩白名单（source.unsplash / text_to_image / iconify / simpleicons 均已在册）。
- 目录：`assets/library/`（含 `index.json` 初始 `[]`）入 git；`assets/cache/` 与 `assets/issues.jsonl` 已加入 `.gitignore`。测试用 `AIOUX_ASSETS_DIR` 临时目录隔离 + mock fetch，离线可跑。
- 验证记录：新增 4 个测试文件（sources/store/issues/index）共 23 用例；`node --test` 全量 72/72 通过，`GetDiagnostics` 无错误。
- 待办（后续单独任务，需先确认）：接入主生成流程（intent.js 提供素材给模型 / index.js 挂 `/assets` 静态路由）属核心逻辑改动，本分支只到自包含模块为止。

### 2026-06-08 记忆模块（Memory）自包含落地（feature/memory-module）

- `server/config.js` 仅新增 1 行常量：`export const MEMORY_FILE = path.join(SNAPSHOTS_DIR, 'memory.json');`（本分支独占，合并留意）。
- 新建记忆模块（自包含，**暂不接入主生成流程**，刻意不碰 intent.js 以避开与 telemetry 分支冲突）：
  - `memoryStore.js`：底层原子 IO，`loadMemoryFile/writeMemoryFile/createEmptyMemory`；损坏 JSON → warn + 默认结构（仿 graph.js）；原子写 tmp+rename；路径按 `AIOUX_SNAPSHOTS_DIR` 实时解析以隔离测试。
  - `memoryProfile.js`：零 IO 纯函数 `updateProfile/extractKeywords/derivePreference`；`reverted` 只累加 variantReverts，净分 = count − reverts 随回退下降。
  - `memory.js`：门面 + 内存单例 + 串行写队列（仿 snapshots commitQueue）；`recordInteraction/recordRevert/recordAssetUsage` 写入，`getPreferenceProfile/getPageMemory/findRelatedPages/listAssetsByNode` 读取；`shouldUpdate===false` 不污染画像；资产经 isAllowedAssetUrl 白名单校验，非法记 `asset_rejected` 事件不入索引。
  - `memorySummary.js`：纯函数 `buildMemorySection`，冷启动返回 `{text:'',used:false}`，含"诉求优先"声明（仅设计未接线）。
- 数据模型：`{version,updatedAt,pages,assets,preferences{sceneTypeCounts,variantCounts,variantReverts,keywordCounts,motionAffinity,threeDAffinity,totalSignals},events}`；events 环形缓冲限长。
- 持久化选型：JSON 单文件 `snapshots/memory.json`（沿用 graph.json 范式，零新增依赖，可纳入 git 快照），不引 SQLite。
- 验证记录：新增 4 个测试文件（profile/store/memory/summary）共 13 用例；`node --test` 全量 62/62 通过（49 基线 + 13），`GetDiagnostics` 无错误；并发 20 次 recordInteraction 计数无丢失，真实 `snapshots/` 未污染。
- 待办（后续单独任务，需先确认）：接入主流程——在 `buildMessages` 的 contextText 注入 `buildMemorySection(...).text`、在决策写回流程调用 `recordInteraction`/`recordRevert`；建议在 telemetry 分支合并后再做，避免同改 intent.js 冲突。

### 2026-06-08 变体选择可观测（feature/variant-telemetry）

- 目标：把"本次选中了哪个预设变体、为何选中、选择耗时"打通到日志、timing 与 API 响应，让变体选择过程可观测可评测。
- 改动（2 核心文件 + 1 测试，纯增量、向后兼容）：
  - `server/intent.js`：`buildSelectedVariantSection` 记录 `selectMs` 并返回精简 `meta`（id/name/sceneType/skillSource/priority/reason）；`buildMessages` 新增可选第 4 参 `observe=null`，传入时回填 `observe.variant`、`observe.selectMs`；默认 null 时行为与改造前完全一致（不影响 prompt 内容）。
  - `server/routes.js`：`/api/interact` 传 `observe={}` 取回 `selectedVariant`，写 `timing.selectMs`、`logTiming` 增加 `variantId/variantReason`，成功响应与 `shouldUpdate=false` 早返回均新增顶层 `variant` 字段（仅新增，前端不读不受影响）。
  - 新增 `server/intent.variant.test.js`（3 用例）：回填 variant/selectMs、meta 字段齐全、传/不传 observe 的 messages 完全一致（不污染 prompt）。
- 不接素材/记忆模块，避免与其未来接入 intent.js 冲突；选择失败时 `variant=null`、`reason='error'`，不伪装。
- 验证记录：`node --test` 全量 88/88 通过（85 基线 + 3），`GetDiagnostics` 无错误；隔离真实模型验证（临时 `AIOUX_SNAPSHOTS_DIR` + `PORT=3106`）：输入"真实感地球 webgl 3D"，响应 `variant={id:interactive_3d__threejs_webgl, reason:scene_keyword, priority:3}`、`timing.selectMs=0.139`、`modelMs≈15.2s`，成功 create `earth_3d_showcase`，印证选择器专精度修复在真实链路生效。
