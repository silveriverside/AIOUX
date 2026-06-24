# AIOUX 全局进展总览

> 更新时间：2026-06-24
> 作用：快速理解项目当前完成度、已收敛风险、验证基线和下一阶段优先级。

## 1. 当前结论

AIOUX 已从“可运行 Demo”推进到“核心链路较完整、关键风险有回归保护”的状态。文本交互、页面图谱、版本历史、回退、异步快照、patch sync、多模态入口、素材复用、记忆画像、sandbox 隔离基线、意图路由评估、前端 trace 面板和 3D 渲染状态观测均已打通。变体选择已从“服务端关键词预锁单变体”改为“注入全部候选 + 模型按效果优先自选 + 关键词兜底”，并把模型自选结果闭环写入记忆画像。

最新重点收敛：

- three.js 真 3D 白屏问题已修复：宿主在 sandbox `srcdoc` 中注入 importmap，模型使用 `from 'three'` 与 `three/addons/...` 裸导入，OrbitControls 等 examples/jsm 模块不再因裸说明符解析失败而中断。
- 正式 sandbox 渲染状态已可观测：iframe bridge 回传 `frame-render-status`，前端 trace 与后端 `[client-log]` 双落盘，验收不再只看 HTML 字符串。
- 天体类视觉质量进一步收敛：three 变体要求光环、卫星、风暴必须是可见几何或表面纹理，热点文字不能替代主体视觉元素；`saturn_3d_detail_qa` 实测显示超宽多层光环、卫星球体/轨道和表面云带/风暴纹理。

当前主线验证基线：

- `node --test 'server/**/*.test.js' 'public/**/*.test.js'`：258/258 通过。
- `npm run e2e`：通过，覆盖临时服务、sandbox bridge、本地 3D 交互、内联脚本边界、snapshot、sync 和坏 patch guard。
- `npm run eval:intent-routing`：80/80 通过，四个核心 `intentHint` 各 20 条。
- `npm run eval:asset-quality`：可输出素材质量排序报告。
- `npm run eval:variant-deviation`：可输出「模型自选 vs 服务端兜底」偏离率报告。

## 2. 已完成能力

### 2.1 生成式 UX 主链路

- Express 后端、原生前端、StepFun 调用、sandbox iframe 渲染已打通。
- 支持 `create`、`navigate`、`stay/full`、`stay/patch` 等决策落地。
- 图谱导航、面包屑、节点版本、版本回退、最终 HTML 同步均可用。
- patch guard 已覆盖风险评分、失败回滚、deferred sync，避免坏 patch 提交。

### 2.2 多模态与交互路由

- 已具备文本、pointer、语音、视觉、WebXR AR 入口。
- `route-interaction.js` 已抽为可回放纯函数。
- 意图路由评测集从 22 条扩展到 80 条。
- 四类核心意图均衡覆盖：`local_native`、`create_or_navigate`、`refine_current`、`model_decide` 各 20 条。

### 2.3 变体选择（效果优先 · 模型自选）

已完成：

- `buildSelectedVariantSection` 不再用关键词在服务端预锁单变体，而是注入当前场景的全部启用候选变体，由模型按“效果优先”自选。
- 关键词打分 + priority 加权仅作为兜底默认与可观测参考（注入文本中标注“服务端兜底建议”）。
- 真实几何体（地球/星球/天体/球体/真实产品模型）硬约束走真 3D（WebGL/three.js），禁止用平面图 `rotateY` 冒充球体；伪 3D（CSS 3D / GSAP）限定卡片翻转/立方体/层叠视差/动效叙事等适用范围。
- three.js 变体提升 priority（3→4）并补真实几何体关键词，确保兜底排序也把真 3D 排在伪 3D 前。
- 模型在决策 JSON 用 `variantId` 回报所选变体：解析层做类型门禁（非字符串拒绝落地），并作为可观测字段返回。
- 闭环：记忆写回时用 `resolveEffectiveVariant` 优先采用模型自选的合法变体（`reason=model_selected`），非法/缺失 id 回退服务端兜底，避免脏值污染画像。
- 偏离观测：`classifyVariantSelection` 把每次交互分为 match/deviate/invalid/absent 四类，实时写入 `[timing]` 日志（`modelVariantId`、`variantDeviation`），并在「应用成功」路径累计到 `preferences.variantSelection`；`npm run eval:variant-deviation` 输出偏离率（`deviate/(match+deviate)`）、采纳率与脏值率报告。

仍可继续：

- 积累真实样本后，按偏离率/采纳率评估模型自选质量，并据此调优 prompt 与变体注入文案。

### 2.4 模型 JSON 稳定性

已对以下异常做显式处理或回归保护：

- 顶层非对象、数组包裹单个决策对象。
- 嵌套 `decision` 伪装。
- 截断 JSON 与尾部截断候选。
- 缺失 `shouldUpdate`、`shouldUpdate` 类型污染。
- 非法 `action` / `mode` 枚举。
- `mode=patch` 但 `patches` 非数组。
- 自然语言混入、Markdown code fence、多 JSON 候选。
- 多个合法决策候选、无唯一合法候选。
- 重复关键字段，包括 Unicode escape 形式的重复 key。
- `nodeId`、`parentId`、`title`、`intent`、`reasoning`、`html` 类型污染。
- 字段边界整体右移损坏，例如真实样本 `":true,": "create"` 与 `nodeId{` / `html{`，可恢复时会同时恢复 `shouldUpdate=true` 与 `action=create`，不可恢复短乱码仍显式 no_update 并记录 `[parse-debug]`。

当前仍未做的更大策略升级：

- `json_schema strict`。
- 决策 JSON 与 HTML 生成两阶段拆分。

### 2.5 Sandbox 安全隔离

已完成：

- 默认 sandbox 去除 `allow-same-origin`。
- iframe 内容通过 `srcdoc` 渲染，父页面不访问 iframe 同源 DOM。
- bridge 增加 `event.source`、nonce、协议白名单和 payload 字段校验。
- bridge 增加 `frame-render-status`，由 iframe 主动回报 `ok`、`hasCanvas`、`sceneType` 与首个脚本错误；该通道只作观测，不修改 capabilities 或触发交互。
- pointer bridge 拒绝非可信合成事件。
- 浏览器 E2E 覆盖真实 sandbox bridge、父窗口伪造消息拒绝、错误 nonce 拒绝。
- 内联脚本边界 E2E 确认：生成 HTML 内联脚本可在 iframe 内执行，但不能访问父页面 DOM 或绕过 bridge。

仍需单独策略确认：

- 是否禁用或进一步收紧生成 HTML 内联脚本。
- 是否引入更完整的 sandbox isolation protocol。

### 2.6 记忆、素材与质量信号

已完成：

- 成功交互写回记忆画像。
- revert 负反馈写回。
- 最终 HTML 实际引用素材写回索引。
- 当前页与相关页历史素材复用。
- 素材质量分接入排序。
- 综合权重排序接入。
- issue/revert 风险惩罚接入。
- `npm run eval:asset-quality` 支持文本/JSON 报告、limit、help、错误参数显式失败。

仍可继续：

- 调优质量分权重。
- 扩大质量信号来源。
- 补充使用结果评估。

### 2.7 前端可观测性

已完成：

- 前后端 timing 与 `traceId` 贯通。
- 后端结构化 timing 日志包含素材复用统计。
- 前端新增最近 trace 面板，展示事件名、`traceId`、耗时和错误状态。
- 前端会把可信 `frame-render-status` 写入 trace 面板并 POST `/api/client-log`，后端结构化记录 `[client-log]`，便于统计真实 3D 渲染成功率。
- trace 面板覆盖空状态、HTML 转义和环形截断。
- 桌面和移动视口均可见。

仍可继续：

- 在 trace 面板展示模型决策、素材复用、修复记录、snapshot job、git commit。
- 真实交互 trace 回放，用于意图路由误判复盘。

## 3. 当前风险清单

| 风险 | 优先级 | 当前状态 | 下一步 |
|------|--------|----------|--------|
| 模型 JSON 输出稳定性 | P0 | 解析层门禁已大幅收敛，字段整体右移样本已可恢复 | 继续积累 `[parse-debug]`，评估 `json_schema strict` 或两阶段生成，需策略确认 |
| sandbox 与内联脚本策略 | P0 | 隔离与 bridge 已有回归保护 | 是否禁用/收紧内联脚本需单独确认 |
| 视觉质量不稳定 | P1 | 3D 天体细节已通过 prompt/验收约束收敛，仍依赖模型执行质量 | 建立视觉质量评估器与截图回看样本集 |
| 素材排序权重 | P1 | 已接入质量分、权重和风险惩罚 | 继续调参与结果评估 |
| snapshot job 持久化 | P2 | 当前仍在进程内存 | 需要设计持久化策略 |
| trace 面板深度 | P2 | 已有最小面板 | 扩展决策、素材、commit、修复记录 |

## 4. 推荐下一阶段

优先选择不需要架构确认、可一轮闭环的任务：

1. `feature/visual-quality-evaluator`
   - 建立画面型、卡片型、2D/3D 场景质量样本。
   - 先离线评估，不改变生成策略。

2. `feature/reusable-asset-quality-ranking-tuning`
   - 基于现有质量分、权重和风险惩罚继续调优。
   - 补充可解释排序报告或回归样本。

3. `feature/trace-panel-detail`
   - 扩展现有 trace 面板，补决策、素材复用、snapshot 和 commit 信息。
   - 保持前端展示层改动，不改后端协议时优先复用已有响应字段。

需要单独确认后再做的任务：

- `feature/strict-decision-schema`。
- `feature/two-phase-generation`。
- `security/sandbox-isolation-protocol`。
- snapshot job 持久化。

## 5. 验收基线

每轮改动至少满足：

- 聚焦测试通过。
- 全量 `node --test` 通过。
- 涉及浏览器交互或 sandbox 时运行 `npm run e2e`。
- 涉及意图路由时运行 `npm run eval:intent-routing`。
- 涉及素材质量时运行 `npm run eval:asset-quality`。
- 更新路线看板、总览文档或进展日志。

## 6. 端到端测试样例

当前端到端测试入口是 `scripts/e2e.mjs`，命令为：

```bash
npm run e2e
```

默认行为：

- 未设置 `AIOUX_BASE_URL` 时，自动启动托管临时服务。
- 自动分配临时端口。
- 使用临时 `AIOUX_SNAPSHOTS_DIR`，避免污染本地快照目录。
- 测试结束后关闭托管服务并清理临时目录。

已覆盖样例：

### 6.1 服务启动与环境检查

- 请求 `/api/status`。
- 验证服务可用。
- 验证 `STEPFUN_API_KEY` 已配置，避免真实模型链路 E2E 在缺少密钥时误跑。

### 6.2 Sandbox Bridge 与本地 3D 交互

测试目标：

- 通过真实 sandbox iframe 上报 `frame-capabilities`。
- 验证父窗口伪造 `frame-capabilities` 不会覆盖能力。
- 验证父窗口伪造 `frame-pointer` 不会改变状态栏。
- 在 iframe 内真实点击 3D 场景背景。
- 断言本地原生交互不会触发 `/api/interact`。
- 断言状态栏显示“未触发重新生成”。

核心验收：

```text
[e2e] sandbox bridge auth + local 3D interaction ok
[e2e] status: 当前 3D 场景已原生处理 点击，未触发重新生成
```

### 6.3 内联脚本 Sandbox 边界

测试目标：

- 生成 HTML 内联脚本确实在 sandbox iframe 内执行。
- 内联脚本不能访问父页面 DOM。
- 错误 nonce 的 `frame-capabilities` 不能覆盖父侧能力。
- 错误 nonce 的 `frame-pointer` 不能触发交互状态变化。
- 合成 pointer 事件不应绕过可信事件限制。

核心验收：

```text
[e2e] inline script sandbox boundary ok
```

### 6.4 Patch Sync 与异步 Snapshot

测试目标：

- 前端通过 `stage.renderFull(...)` 建立确定性 HTML。
- 前端通过 `stage.applyPatchesSafely(...)` 应用安全 patch。
- 调用 `/api/sync` 写回最终 HTML。
- 从响应中拿到 `snapshot.jobId`。
- 轮询 `/api/snapshot-jobs/:jobId`，直到状态为 `done`。
- 验证至少发生一次 `/api/sync` 请求。
- 验证 snapshot job 返回 commit hash。

核心验收：

```text
[e2e] snapshot status ok
[e2e] sync requests: 1
[e2e] snapshot job polls: 1
[e2e] saved: <elapsedMs>ms <commit>
```

### 6.5 坏 Patch Guard

测试目标：

- 构造删除 `body > *` 的高风险 patch。
- 断言 patch 在风险预检阶段被拒绝。
- 断言页面内容已回滚。
- 断言坏 patch 不触发 `/api/sync`。

核心验收：

```text
[e2e] bad patch guard ok
[e2e] bad patch error: patch 风险过高
```

### 6.6 外部服务模式

设置 `AIOUX_BASE_URL` 时，E2E 不启动托管临时服务，而是复用指定外部服务：

```bash
AIOUX_BASE_URL=http://localhost:3000 npm run e2e
```

适用场景：

- 本地已手动启动服务。
- 需要验证某个远端或固定端口环境。
- 需要保留服务运行状态做连续排查。
