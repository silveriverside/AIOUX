# AIOUX 当前路线看板

> 更新时间：2026-06-23
> 作用：作为当前决策看板，保留 `.trae/documents/AIOUX-project-requirements-architecture-status.md` 作为完整历史账本。
> 全局进展快照：见 `.trae/documents/AIOUX-global-progress.md`。

## 1. 当前状态总览

- 项目已具备可运行的实时生成式 UX Demo：文本交互、Page Graph、节点历史、回退、异步快照、patch sync、多模态入口和浏览器端到端脚本均已打通。
- 阶段 A 的阻断性 bug 已基本完成；阶段 B 的素材/记忆闭环已推进到第 3.13 步。
- 变体选择已重构为“效果优先 + 模型自选”：注入当前场景全部候选让模型自选，关键词降为兜底；真实几何体强制走真 3D（WebGL）；模型回报 `variantId` 既作可观测字段又闭环写入记忆画像；并新增 match/deviate/invalid/absent 偏离观测与 `npm run eval:variant-deviation` 偏离率报告。
- 最新验证：`npm run e2e` 已默认启动隔离服务并使用临时 snapshots；意图路由评估器当前 80/80 通过；素材质量评估器已可离线输出排序报告；近期全量 `node --test` 为 258/258 通过。
- 当前最大风险不在基础链路，而在模型输出稳定性、安全隔离、意图路由误判和生成质量稳定性。

## 2. 已完成里程碑

- 基础运行链路：Express 后端、原生前端、StepFun 调用、sandbox iframe 渲染、图谱导航与版本历史。
- 交互入口：文本、pointer、语音、视觉、WebXR AR 能力入口。
- 性能闭环：`traceId`、前后端 timing、异步快照任务、`/api/snapshot-jobs/:jobId` 查询。
- patch 安全：patch guard、风险评分、失败回滚、deferred sync，避免提交坏 patch。
- 记忆链路：记忆路径统一、偏好画像注入 prompt、成功交互写回、revert 负反馈写回。
- 素材链路：素材异步解析、最终 HTML 实际引用素材写回、当前页和相关页历史素材复用。
- 素材观测：召回数量、实际注入 prompt 数量、被 prompt 上限截断数量、prompt 上限字段都已进入 timing 和结构化日志。
- 素材质量信号：`memory.assets` 已记录 `lastUsedAt`；`scoreAssetQuality(...)` 已可基于使用次数、节点覆盖和最近使用时间输出离线质量分；`npm run eval:asset-quality` 可输出离线排序报告。
- E2E 隔离：`npm run e2e` 默认托管临时服务，使用临时 `AIOUX_SNAPSHOTS_DIR` 和临时端口；显式 `AIOUX_BASE_URL` 时保留外部服务模式。
- 意图路由评估：新增 `npm run eval:intent-routing`，可离线输出总准确率、误判明细和按 category 分类统计。

## 3. 当前风险清单

- P0：模型 JSON 输出仍可能字段污染、缺字段、截断或混入自然语言；当前已对顶层非对象、数组包裹、嵌套 decision 伪装、截断修复、缺失/污染关键字段、重复关键字段（含 Unicode escape）、非法 action/mode 枚举、混合文本候选提取、多合法候选歧义、无唯一合法候选和尾部截断候选做显式处理，后续仍需评估 `json_schema strict` 或两阶段生成。
- P0：sandbox iframe 默认已移除 `allow-same-origin`，iframe bridge 消息已增加 `event.source`、nonce 与协议字段白名单校验，并补充真实浏览器 E2E 回归；内联脚本边界已有 E2E 基线（可执行但不能访问父页面 DOM 或绕过 bridge），后续是否禁用/收紧内联脚本仍需单独架构决策。
- P1：意图路由仍以启发式为主，已有可回放样本集和准确率输出；样本已扩到 80 条，核心 intentHint 已各覆盖 20 条。
- P1：素材复用排序已接入质量分、综合权重与 issue/revert 风险惩罚；后续可继续调优权重、扩大质量信号和补充使用结果评估。
- P1：视觉质量仍依赖 prompt，模型可能把画面型请求生成成百科式卡片页；3D 真实几何体场景已通过“效果优先 + 强制真 3D + 禁止平面冒充”收敛，其余场景仍待建立视觉质量评估器。
- P2：snapshot job 状态仅在进程内存中，服务重启后历史 jobId 不可恢复。
- P2：前端已有最近 trace 面板，能查看交互事件、traceId、耗时和错误状态；后续可继续补齐决策、素材复用、修复记录和 commit 详情。

## 4. 推荐下一阶段路线

### 4.1 低风险优先闭环

- `feature/reusable-asset-quality-ranking-tuning`：在已接入质量分、综合权重和风险惩罚的基础上，继续调优权重与质量信号。
- `feature/visual-quality-evaluator`：沉淀画面型、卡片型、2D/3D 场景的质量样本和自动/半自动评分。
- `feature/intent-routing-evaluator-expanded`：样本已达到核心 intentHint 各 20 条，后续转为真实 trace 回放或误判复盘入口。

### 4.2 核心稳定性升级

- `feature/strict-decision-schema`：使用 `json_schema strict` 固化决策字段，减少模型 JSON 异常。
- `feature/two-phase-generation`：拆成“决策 JSON”和“HTML 生成”两阶段，减少长 HTML 导致的 JSON 截断。
- `feature/node-id-dedup-policy`：进一步完善 create 时 nodeId 自动去重和可观测日志。

### 4.3 安全与产品化

- `security/sandbox-isolation-protocol`：评估移除 `allow-same-origin`、收紧 sandbox 权限、增加 `postMessage` 白名单和 nonce 校验。
- `feature/trace-panel`：已有最小最近 trace 面板；后续可扩展为完整操作追踪，展示每次交互的决策、素材复用、修复记录和 git commit。
- `feature/template-dsl-generation`：把四套体验范式逐步升级为模板/DSL 生成，减少自由 HTML 漂移。

## 5. 当前建议立即推进

- 优先继续从 `feature/intent-routing-evaluator-expanded` 转向更高价值的误判来源挖掘，例如真实交互 trace 回放、视觉质量评估或素材排序权重调优。
- 随后推进 `feature/visual-quality-evaluator` 或 `feature/reusable-asset-quality-ranking-tuning`，分别收敛画面型生成质量和素材排序权重调优。
- `json_schema strict` 和 sandbox 安全属于核心策略/架构改动，实施前需要单独说明影响并确认。

## 6. 验收基线

- 单测：关键改动后运行聚焦测试，再运行全量 `node --test`。
- 诊断：改动后运行 `GetDiagnostics`，确认无新增错误。
- E2E：默认 `npm run e2e` 应输出 `managed server` 与临时 `snapshots dir`，并完成 snapshot、sync、坏 patch、本地 3D 交互验证。
- 意图路由：`npm run eval:intent-routing` 应输出总样本数、准确率、分类统计和误判明细；当前基础样本期望 100% 通过。
- 素材质量：`npm run eval:asset-quality` 应输出素材总数、Top 素材、平均分和质量分；`--json` 应输出按质量分排序的 assets 列表与 summary 摘要；`--limit=N` / `--limit N` 应限制输出条数但保留全量 total；无效或缺失 limit 值应显式失败；`--help` / `-h` 应输出用法说明。
- 文档：每个小步完成后更新本路线看板或总文档操作日志。

## 7. 最新推进记录

- 2026-06-14：新增本路线看板，作为当前决策和任务优先级入口。
- 2026-06-14：完成 E2E 快照隔离，`npm run e2e` 默认启动托管临时服务；`AIOUX_BASE_URL` 显式设置时仍走外部服务模式。
- 2026-06-14：修复 `routes.memoryWriteback.test.js` 的后台 snapshot job 等待问题，避免测试清理临时目录时与异步 git 写入竞争。
- 2026-06-15：新增意图路由离线评估器，复用 `route-interaction.cases.js` 输出准确率、分类统计和失败明细。
- 2026-06-15：为素材记忆新增 `lastUsedAt` 最近使用时间质量信号，后续可用于素材新鲜度和质量评分。
- 2026-06-15：新增 `scoreAssetQuality(...)` 离线质量评分 helper，暂不接入素材排序策略。
- 2026-06-15：新增素材质量离线评估器 `npm run eval:asset-quality`，读取 `memory.assets` 输出质量排序报告，暂不改变运行时召回排序。
- 2026-06-15：为素材质量离线评估器新增 `--limit=N` 与 `--limit N`，便于大素材集只查看 Top N，同时保留全量素材总数。
- 2026-06-15：素材质量离线评估器对无效 `--limit` 显式返回错误，避免参数拼写或取值错误被静默当作无限制运行。
- 2026-06-16：素材质量离线评估器对缺失值的 `--limit` 显式返回错误，避免参数遗漏被静默当作无限制运行。
- 2026-06-16：素材质量离线评估器新增 `--help` / `-h`，直接输出 `--json`、`--limit=N`、`--limit N` 等用法说明。
- 2026-06-16：素材质量离线评估器 JSON 报告新增 `summary.topScore` 与 `summary.averageScore`，便于快速观察整体质量分布。
- 2026-06-16：素材质量离线评估器文本模式新增 `averageScore`，无需 JSON 解析即可查看整体平均质量分。
- 2026-06-18：模型 JSON 解析新增顶层类型门禁；当模型返回合法 JSON 但顶层不是决策对象时显式 `ok=false` 且阻止落地，避免数组/字符串被误当字段损坏修复。
- 2026-06-18：复用素材排序已接入 `scoreAssetQuality(...)` 与可配置综合分权重，默认按 `scope -> weightedScore -> qualityScore -> useCount` 排序，并在调试文本中暴露 `weightedScore/qualityScore/use/coverage/recency`。
- 2026-06-18：复用素材排序新增风险惩罚分，基于 `issueCount`、近期 `lastIssueAt` 与 `revertCostCount` 对高风险素材降权；`revertCostCount` 是页面级回退代理信号，不伪装成素材根因。
- 2026-06-18：意图路由评测集从 22 条扩充到 42 条，新增热点 target、文本本地控制、细化、新建、generic 兜底和 caps 缺失等边界样本，离线评估保持 42/42 通过。
- 2026-06-18：补强 sandbox 隔离回归测试，固定默认权限不含 `allow-same-origin`、危险组合乱序/重复仍被拒绝、舞台渲染与当前 HTML 读取均只依赖 `srcdoc` 而不访问 iframe 同源 DOM；同时明确 `postMessage('*')` 与消息来源校验仍是后续需解决的安全问题。
- 2026-06-20：sandbox iframe bridge 消息增加 `event.source` 与 nonce 双校验，`frame-capabilities` 与 `frame-pointer` 均拒绝伪造来源或错误 nonce；新增 stage/pointer 回归测试，全量 `node --test` 保持 167/167 通过。
- 2026-06-20：sandbox iframe bridge 增加协议白名单与字段形状校验，只接受 `frame-capabilities` 与 `frame-pointer`，拒绝未知 kind、畸形 capabilities、非法 sceneType/数组元素/数组长度、非法 pointer phase/坐标范围/尺寸/label；全量 `node --test` 保持 169/169 通过。
- 2026-06-22：E2E 改用真实 sandbox iframe bridge 上报 capabilities 与 pointer 事件，验证父窗口伪造消息不会改变 capabilities 或触发本地交互；`npm run e2e` 与 `node --test` 均通过。
- 2026-06-22：新增内联脚本 sandbox 边界 E2E，确认生成 HTML 内联脚本会在 iframe 内执行，但不能访问父页面 DOM；同时 bridge 拒绝非可信合成 pointer 事件，错误 nonce 与合成事件都不会改变父侧 capabilities 或状态；`npm run e2e` 与 `node --test` 均通过。
- 2026-06-22：模型决策 JSON 解析新增关键字段门禁，缺失 `shouldUpdate`、`shouldUpdate` 类型污染、非法 `action` / `mode` 枚举、`mode=patch` 但 `patches` 非数组时均显式 `ok=false` 且阻止落地；全量 `node --test` 172/172 通过。
- 2026-06-22：意图路由评测集从 42 条扩充到 60 条，新增本地原生交互、热点 target、文本创建/细化、generic 兜底和 caps 缺失样本；`npm run eval:intent-routing` 60/60 通过，全量 `node --test` 191/191 通过。
- 2026-06-22：意图路由评测集从 60 条扩充到 80 条，四个核心 intentHint（`local_native`、`create_or_navigate`、`refine_current`、`model_decide`）各覆盖 20 条；`npm run eval:intent-routing` 80/80 通过，全量 `node --test` 211/211 通过。
- 2026-06-22：模型决策 JSON 解析新增混合输出候选选择回归，支持自然语言包裹的唯一严格合法决策对象，阻止多个合法决策候选、多个候选无唯一合法决策、混合非严格候选和尾部截断候选落地；`server/intent.test.js` 16/16 通过，全量 `node --test` 218/218 通过。
- 2026-06-22：前端新增最近 trace 面板，记录 `logTiming` 事件的 `traceId`、事件名、耗时和错误状态，支持 HTML 转义、空状态和环形截断；桌面/移动浏览器检查通过，`npm run e2e` 通过，全量 `node --test` 223/223 通过。
- 2026-06-22：模型决策 JSON 解析继续收敛门禁，新增数组包裹、嵌套 decision 伪装、重复关键字段（含 Unicode escape）、关键字段对象类型污染和控制字符包裹回归；`server/intent.test.js` 22/22 通过，全量 `node --test` 229/229 通过。
