# AIOUX 当前路线看板

> 更新时间：2026-06-14  
> 作用：作为当前决策看板，保留 `.trae/documents/AIOUX-project-requirements-architecture-status.md` 作为完整历史账本。

## 1. 当前状态总览

- 项目已具备可运行的实时生成式 UX Demo：文本交互、Page Graph、节点历史、回退、异步快照、patch sync、多模态入口和浏览器端到端脚本均已打通。
- 阶段 A 的阻断性 bug 已基本完成；阶段 B 的素材/记忆闭环已推进到第 3.13 步。
- 最新验证：`npm run e2e` 已默认启动隔离服务并使用临时 snapshots；意图路由评估器当前 22/22 通过；素材质量评估器已可离线输出排序报告；近期全量 `node --test` 为 124/124 通过，`GetDiagnostics` 无错误。
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

- P0：模型 JSON 输出仍可能字段污染、缺字段、截断或混入自然语言，启发式修复不能覆盖所有情况。
- P0：sandbox iframe 同时允许 `allow-scripts` 与 `allow-same-origin`，生成 HTML 又允许内联脚本，隔离边界仍需安全评估。
- P1：意图路由仍以启发式为主，已有基础可回放样本集和准确率输出，但样本规模仍偏小，需要继续扩展真实场景。
- P1：素材复用已有观测字段、最近使用时间信号和基础离线质量分，但还没有接入排序策略，也缺少失效、回退、使用结果等综合质量因子。
- P1：视觉质量仍依赖 prompt，模型可能把画面型请求生成成百科式卡片页。
- P2：snapshot job 状态仅在进程内存中，服务重启后历史 jobId 不可恢复。
- P2：缺少操作 trace 面板，无法在前端直接查看模型决策、修复记录、素材复用和 commit。

## 4. 推荐下一阶段路线

### 4.1 低风险优先闭环

- `feature/reusable-asset-quality-ranking-integration`：基于离线质量评估器结果，评估是否接入素材复用排序，并保留可回滚观测开关。
- `feature/visual-quality-evaluator`：沉淀画面型、卡片型、2D/3D 场景的质量样本和自动/半自动评分。
- `feature/intent-routing-evaluator-expanded`：继续扩展真实页面和自然语言样本，覆盖更多误判边界。

### 4.2 核心稳定性升级

- `feature/strict-decision-schema`：使用 `json_schema strict` 固化决策字段，减少模型 JSON 异常。
- `feature/two-phase-generation`：拆成“决策 JSON”和“HTML 生成”两阶段，减少长 HTML 导致的 JSON 截断。
- `feature/node-id-dedup-policy`：进一步完善 create 时 nodeId 自动去重和可观测日志。

### 4.3 安全与产品化

- `security/sandbox-isolation-protocol`：评估移除 `allow-same-origin`、收紧 sandbox 权限、增加 `postMessage` 白名单和 nonce 校验。
- `feature/trace-panel`：增加操作 trace 面板，展示每次交互的决策、耗时、素材复用、修复记录和 git commit。
- `feature/template-dsl-generation`：把四套体验范式逐步升级为模板/DSL 生成，减少自由 HTML 漂移。

## 5. 当前建议立即推进

- 优先做 `feature/reusable-asset-quality-ranking-integration`，把素材复用从“离线可评估”推进到“可排序调优”；接入前需先说明排序变化影响。
- 随后扩展 `feature/intent-routing-evaluator-expanded`，补充真实页面和自然语言样本。
- `json_schema strict` 和 sandbox 安全属于核心策略/架构改动，实施前需要单独说明影响并确认。

## 6. 验收基线

- 单测：关键改动后运行聚焦测试，再运行全量 `node --test`。
- 诊断：改动后运行 `GetDiagnostics`，确认无新增错误。
- E2E：默认 `npm run e2e` 应输出 `managed server` 与临时 `snapshots dir`，并完成 snapshot、sync、坏 patch、本地 3D 交互验证。
- 意图路由：`npm run eval:intent-routing` 应输出总样本数、准确率、分类统计和误判明细；当前基础样本期望 100% 通过。
- 素材质量：`npm run eval:asset-quality` 应输出素材总数、Top 素材和质量分；`--json` 应输出按质量分排序的 assets 列表；`--limit=N` 应限制输出条数但保留全量 total。
- 文档：每个小步完成后更新本路线看板或总文档操作日志。

## 7. 最新推进记录

- 2026-06-14：新增本路线看板，作为当前决策和任务优先级入口。
- 2026-06-14：完成 E2E 快照隔离，`npm run e2e` 默认启动托管临时服务；`AIOUX_BASE_URL` 显式设置时仍走外部服务模式。
- 2026-06-14：修复 `routes.memoryWriteback.test.js` 的后台 snapshot job 等待问题，避免测试清理临时目录时与异步 git 写入竞争。
- 2026-06-15：新增意图路由离线评估器，复用 `route-interaction.cases.js` 输出准确率、分类统计和失败明细。
- 2026-06-15：为素材记忆新增 `lastUsedAt` 最近使用时间质量信号，后续可用于素材新鲜度和质量评分。
- 2026-06-15：新增 `scoreAssetQuality(...)` 离线质量评分 helper，暂不接入素材排序策略。
- 2026-06-15：新增素材质量离线评估器 `npm run eval:asset-quality`，读取 `memory.assets` 输出质量排序报告，暂不改变运行时召回排序。
- 2026-06-15：为素材质量离线评估器新增 `--limit=N`，便于大素材集只查看 Top N，同时保留全量素材总数。
