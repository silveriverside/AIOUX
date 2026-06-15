import { routeInteraction } from '../public/js/route-interaction.js';
import { cases, summarizeMisroutings } from '../public/js/route-interaction.cases.js';

function evaluateIntentRouting(inputCases = cases) {
  const failures = [];
  for (const c of inputCases) {
    const actual = routeInteraction(c.ev, c.caps);
    if (actual.kind !== c.expected.kind || actual.intentHint !== c.expected.intentHint) {
      failures.push({
        category: c.category,
        description: c.description,
        expected: c.expected,
        actual: { kind: actual.kind, intentHint: actual.intentHint },
      });
    }
  }

  const total = inputCases.length;
  const failed = failures.length;
  const passed = total - failed;
  return {
    total,
    passed,
    failed,
    accuracy: total ? passed / total : 1,
    byCategory: summarizeMisroutings(inputCases, failures),
    failures,
  };
}

function printTextReport(report) {
  console.log('Intent routing evaluator');
  console.log(`total=${report.total} passed=${report.passed} failed=${report.failed} accuracy=${(report.accuracy * 100).toFixed(2)}%`);
  for (const row of report.byCategory) {
    console.log(`category=${row.category} total=${row.total} passed=${row.passed} failed=${row.failed}`);
  }
  if (report.failures.length) {
    console.log('failures=');
    console.log(JSON.stringify(report.failures, null, 2));
  }
}

const report = evaluateIntentRouting();
if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report));
} else {
  printTextReport(report);
}

if (report.failed > 0) process.exitCode = 1;
