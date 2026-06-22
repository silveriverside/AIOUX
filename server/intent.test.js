import test from 'node:test';
import assert from 'node:assert/strict';

import { parseHybridOutput } from './intent.js';

const currentNode = {
  nodeId: 'main',
  title: '主页',
  html: '',
};

test('repairs reserved action keyword mistakenly used as nodeId', () => {
  const raw = JSON.stringify({
    shouldUpdate: true,
    action: 'create',
    nodeId: 'create',
    parentId: 'main',
    title: '沉浸式地出视觉场景',
    intent: '生成宇航员从空间站舷窗回望地球的沉浸式视觉场景，以画面为主，支持鼠标视差交互',
    reasoning: '属于沉浸多媒体阅读范式',
    mode: 'full',
    html: '<div id="earthrise-scene"><script>document.addEventListener("mousemove",()=>{})</script></div>',
    patches: [],
  });

  const result = parseHybridOutput(raw, currentNode);

  assert.equal(result.decision.action, 'create');
  assert.equal(result.decision.nodeId, 'earthrise_scene');
  assert.notEqual(result.decision.nodeId, 'create');
});

test('strips trailing braces from reasoning-like corruption and keeps stable nodeId', () => {
  const raw = JSON.stringify({
    shouldUpdate: true,
    action: 'create',
    nodeId: 'earth_3d_showcase{',
    parentId: 'main',
    title: '可旋转地球3D展示{',
    intent: '创建可旋转地球3D展示页面，带热点标注和重力感应{',
    reasoning: '用户要的是3D地球模型和空间交互，应使用3D可视化交互范式{',
    mode: 'full',
    html: '<div id="earth-3d-showcase"></div>',
    patches: [],
  });

  const result = parseHybridOutput(raw, currentNode);

  assert.equal(result.decision.nodeId, 'earth_3d_showcase');
  assert.equal(result.decision.title, '可旋转地球3D展示');
  assert.equal(result.decision.intent.endsWith('{'), false);
  assert.equal(result.decision.reasoning.endsWith('{'), false);
});

test('截断的模型输出修复后不落地（shouldUpdate=false + 显式 error）', () => {
  // 模拟 html 过长被 token 截断：JSON 在 html 字符串中途断开。
  const truncated =
    '{"shouldUpdate":true,"action":"create","nodeId":"big_page","parentId":"main",' +
    '"title":"长页面","intent":"生成","reasoning":"测试","mode":"full",' +
    '"html":"<div><section><p>很长的内容还没结束';

  const result = parseHybridOutput(truncated, currentNode);

  assert.equal(result.ok, false, '截断内容应判失败');
  assert.equal(result.decision.shouldUpdate, false, '不应落地残缺页面');
  assert.ok(result.error && result.error.includes('截断'), '应给出明确的截断错误说明');
});

test('合法 JSON 但顶层不是对象时显式阻止落地', () => {
  const result = parseHybridOutput(
    JSON.stringify([
      {
        shouldUpdate: true,
        action: 'create',
        nodeId: 'array_page',
      },
    ]),
    currentNode
  );

  assert.equal(result.ok, false);
  assert.equal(result.decision.shouldUpdate, false);
  assert.equal(result.decision.nodeId, 'main');
  assert.ok(result.error && result.error.includes('非对象'), '应明确说明模型 JSON 顶层类型异常');
});

test('缺少 shouldUpdate 关键字段时显式阻止落地', () => {
  const result = parseHybridOutput(
    JSON.stringify({
      action: 'create',
      nodeId: 'missing_should_update',
      parentId: 'main',
      title: '缺字段页面',
      intent: '测试缺字段',
      reasoning: '模型漏字段',
      mode: 'full',
      html: '<main>missing</main>',
      patches: [],
    }),
    currentNode
  );

  assert.equal(result.ok, false);
  assert.equal(result.decision.shouldUpdate, false);
  assert.equal(result.decision.nodeId, 'main');
  assert.ok(result.error && result.error.includes('shouldUpdate'), '应明确说明缺少 shouldUpdate');
});

test('关键字段类型污染时显式阻止落地', () => {
  const result = parseHybridOutput(
    JSON.stringify({
      shouldUpdate: 'true',
      action: 'create',
      nodeId: 'polluted_type',
      parentId: 'main',
      title: '类型污染',
      intent: '测试类型污染',
      reasoning: 'shouldUpdate 是字符串',
      mode: 'full',
      html: '<main>polluted</main>',
      patches: [],
    }),
    currentNode
  );

  assert.equal(result.ok, false);
  assert.equal(result.decision.shouldUpdate, false);
  assert.equal(result.decision.nodeId, 'main');
  assert.ok(result.error && result.error.includes('shouldUpdate'), '应明确说明 shouldUpdate 类型错误');
});

test('非法 action 和 mode 枚举时显式阻止落地', () => {
  const result = parseHybridOutput(
    JSON.stringify({
      shouldUpdate: true,
      action: 'delete',
      nodeId: 'bad_enum',
      parentId: 'main',
      title: '非法枚举',
      intent: '测试非法枚举',
      reasoning: 'action 和 mode 非法',
      mode: 'stream',
      html: '<main>bad enum</main>',
      patches: [],
    }),
    currentNode
  );

  assert.equal(result.ok, false);
  assert.equal(result.decision.shouldUpdate, false);
  assert.equal(result.decision.nodeId, 'main');
  assert.ok(result.error && result.error.includes('action'), '应明确说明 action 非法');
});

test('action 尾部结构残片可清理后正常落地', () => {
  const result = parseHybridOutput(
    JSON.stringify({
      shouldUpdate: true,
      action: 'create{',
      nodeId: 'recoverable_action',
      parentId: 'main',
      title: '可恢复 action',
      intent: '测试 action 末尾残片',
      reasoning: '模型多输出了结构残片',
      mode: 'full',
      html: '<main>recoverable</main>',
      patches: [],
    }),
    currentNode
  );

  assert.equal(result.ok, false, '字段残片自动修复仍应暴露警告');
  assert.equal(result.decision.shouldUpdate, true);
  assert.equal(result.decision.action, 'create');
  assert.equal(result.decision.nodeId, 'recoverable_action');
});

test('自然语言包裹 JSON 时提取有效决策对象', () => {
  const raw = [
    '模型判断如下，下面是本次需要执行的决策 JSON：',
    JSON.stringify({
      shouldUpdate: true,
      action: 'create',
      nodeId: 'wrapped_json_page',
      parentId: 'main',
      title: '自然语言包裹页面',
      intent: '测试自然语言包裹 JSON',
      reasoning: '模型在 JSON 前后混入了解释文本',
      mode: 'full',
      html: '<main>wrapped</main>',
      patches: [],
    }),
    '以上 JSON 可直接执行。',
  ].join('\n');

  const result = parseHybridOutput(raw, currentNode);

  assert.equal(result.ok, false, '混入自然语言的自动提取应暴露警告');
  assert.equal(result.decision.shouldUpdate, true);
  assert.equal(result.decision.action, 'create');
  assert.equal(result.decision.nodeId, 'wrapped_json_page');
  assert.ok(result.error && result.error.includes('混入'), '应明确说明模型混入了非 JSON 内容');
});

test('多个 JSON 候选时选择第一个合法决策对象', () => {
  const invalidCandidate = JSON.stringify({
    note: '不是决策对象',
    shouldUpdate: 'true',
  });
  const validCandidate = JSON.stringify({
    shouldUpdate: true,
    action: 'create',
    nodeId: 'second_valid_candidate',
    parentId: 'main',
    title: '第二个候选',
    intent: '测试多个 JSON 候选',
    reasoning: '第一个候选不是合法决策对象，第二个才是',
    mode: 'full',
    html: '<main>second</main>',
    patches: [],
  });

  const result = parseHybridOutput(`${invalidCandidate}\n\n${validCandidate}`, currentNode);

  assert.equal(result.ok, false, '多个候选自动选择应暴露警告');
  assert.equal(result.decision.shouldUpdate, true);
  assert.equal(result.decision.action, 'create');
  assert.equal(result.decision.nodeId, 'second_valid_candidate');
  assert.ok(result.error && result.error.includes('多个 JSON 候选'), '应明确说明存在多个 JSON 候选');
});

test('Markdown code fence 多候选时跳过非决策 JSON 并选择有效决策', () => {
  const raw = [
    '先给出分析对象：',
    '```json',
    JSON.stringify({ analysis: '这里只是说明，不是决策' }),
    '```',
    '最终决策：',
    '```json',
    JSON.stringify({
      shouldUpdate: true,
      action: 'create',
      nodeId: 'fenced_valid_candidate',
      parentId: 'main',
      title: '围栏候选',
      intent: '测试 Markdown code fence 多候选',
      reasoning: '应选择第二个 code fence 中的决策对象',
      mode: 'full',
      html: '<main>fenced</main>',
      patches: [],
    }),
    '```',
  ].join('\n');

  const result = parseHybridOutput(raw, currentNode);

  assert.equal(result.ok, false, 'code fence 多候选自动选择应暴露警告');
  assert.equal(result.decision.shouldUpdate, true);
  assert.equal(result.decision.action, 'create');
  assert.equal(result.decision.nodeId, 'fenced_valid_candidate');
  assert.ok(result.error && result.error.includes('多个 JSON 候选'), '应明确说明存在多个 JSON 候选');
});

test('多个合法 JSON 决策候选时显式阻止落地', () => {
  const draftCandidate = JSON.stringify({
    shouldUpdate: true,
    action: 'create',
    nodeId: 'draft_candidate',
    parentId: 'main',
    title: '草稿候选',
    intent: '测试草稿候选',
    reasoning: '第一个合法对象可能只是示例或草稿',
    mode: 'full',
    html: '<main>draft</main>',
    patches: [],
  });
  const finalCandidate = JSON.stringify({
    shouldUpdate: true,
    action: 'create',
    nodeId: 'final_candidate',
    parentId: 'main',
    title: '最终候选',
    intent: '测试最终候选',
    reasoning: '第二个合法对象才像最终决策',
    mode: 'full',
    html: '<main>final</main>',
    patches: [],
  });

  const result = parseHybridOutput(`${draftCandidate}\n\n${finalCandidate}`, currentNode);

  assert.equal(result.ok, false);
  assert.equal(result.decision.shouldUpdate, false, '多个合法候选存在歧义时不应落地');
  assert.equal(result.decision.nodeId, 'main');
  assert.ok(result.error && result.error.includes('多个合法 JSON 决策候选'), '应明确说明多个合法候选歧义');
});

test('多个非严格合法 JSON 候选不应回退修复第一个并落地', () => {
  const repairableButAmbiguous = JSON.stringify({
    foo: true,
    bar: 'create',
    baz: 'fake_node',
    mode: 'full',
    html: '<main>fake</main>',
  });
  const noteCandidate = JSON.stringify({ note: '另一个非决策候选' });

  const result = parseHybridOutput(`${repairableButAmbiguous}\n\n${noteCandidate}`, currentNode);

  assert.equal(result.ok, false);
  assert.equal(result.decision.shouldUpdate, false, '多个非严格候选不应交给模糊修复后落地');
  assert.equal(result.decision.nodeId, 'main');
  assert.ok(result.error && result.error.includes('没有唯一合法 JSON 决策候选'), '应明确说明候选无法可靠选择');
});

test('自然语言包裹的单个非严格合法 JSON 不应被模糊修复后落地', () => {
  const repairableButMixed = JSON.stringify({
    foo: true,
    actionGuess: 'create',
    titleText: 'wrong_page',
    mode: 'full',
    html: '<main>wrong</main>',
  });

  const result = parseHybridOutput(`模型先解释一下：\n${repairableButMixed}\n以上供参考。`, currentNode);

  assert.equal(result.ok, false);
  assert.equal(result.decision.shouldUpdate, false, '混合内容里的非严格候选不应交给模糊修复后落地');
  assert.equal(result.decision.nodeId, 'main');
  assert.ok(result.error && result.error.includes('没有合法 JSON 决策候选'), '应明确说明混合内容没有合法决策候选');
});

test('前置 JSON 后跟截断决策 JSON 时优先按截断阻止落地', () => {
  const noteCandidate = JSON.stringify({ note: '前置说明对象，不是决策' });
  const truncatedDecision =
    '{"shouldUpdate":true,"action":"create","nodeId":"truncated_after_note","parentId":"main",' +
    '"title":"截断候选","intent":"测试","reasoning":"真正决策被截断","mode":"full",' +
    '"html":"<main>unfinished';

  const result = parseHybridOutput(`${noteCandidate}\n\n${truncatedDecision}`, currentNode);

  assert.equal(result.ok, false);
  assert.equal(result.decision.shouldUpdate, false);
  assert.equal(result.decision.nodeId, 'main');
  assert.ok(result.error && result.error.includes('截断'), '应明确说明尾部决策 JSON 被截断');
});

test('正常完整输出不受截断保护影响（ok=true 且可落地）', () => {
  const raw = JSON.stringify({
    shouldUpdate: true,
    action: 'create',
    nodeId: 'normal_page',
    parentId: 'main',
    title: '正常页面',
    intent: '生成正常页面',
    reasoning: '完整输出',
    mode: 'full',
    html: '<div id="normal-page"><p>完整内容</p></div>',
    patches: [],
  });

  const result = parseHybridOutput(raw, currentNode);

  assert.equal(result.ok, true);
  assert.equal(result.decision.shouldUpdate, true);
  assert.equal(result.decision.nodeId, 'normal_page');
});
