import test from 'node:test';
import assert from 'node:assert/strict';

import { routeInteraction } from './route-interaction.js';
import { cases, summarizeMisroutings } from './route-interaction.cases.js';

const failures = [];

for (const c of cases) {
  test(`[${c.category}] ${c.description}`, () => {
    const actual = routeInteraction(c.ev, c.caps);
    try {
      assert.equal(actual.kind, c.expected.kind, 'kind 不匹配');
      assert.equal(actual.intentHint, c.expected.intentHint, 'intentHint 不匹配');
    } catch (e) {
      failures.push({
        category: c.category,
        description: c.description,
        expected: c.expected,
        actual: { kind: actual.kind, intentHint: actual.intentHint },
      });
      throw e;
    }
  });
}

test('误判按边界类别汇总（无误判）', () => {
  const summary = summarizeMisroutings(cases, failures);
  const totalFailed = summary.reduce((acc, row) => acc + row.failed, 0);
  if (totalFailed > 0) {
    console.error('意图路由误判汇总:', JSON.stringify(summary, null, 2));
  }
  assert.equal(totalFailed, 0, `存在 ${totalFailed} 条意图路由误判`);
});
