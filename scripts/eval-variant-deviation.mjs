// 离线评估：模型自选变体 vs 服务端兜底建议的偏离率，用于评估模型自选质量。
// 数据来源：记忆画像 preferences.variantSelection（仅累计「真正应用成功」的交互）。
import { getPreferenceProfile } from '../server/memory.js';

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

function evaluateVariantDeviation() {
  const profile = getPreferenceProfile();
  const vs = profile.variantSelection || { match: 0, deviate: 0, invalid: 0, absent: 0, total: 0 };
  const legalChoices = vs.match + vs.deviate;
  const total = vs.total || 0;

  return {
    generatedAt: Date.now(),
    counts: vs,
    legalChoices,
    // 主指标：合法选择中模型偏离服务端兜底的比例。
    deviationRate: profile.variantDeviationRate ?? (legalChoices ? round3(vs.deviate / legalChoices) : 0),
    // 辅助指标：模型采纳自选机制的比例（回报了合法 variantId）。
    adoptionRate: total ? round3(legalChoices / total) : 0,
    // 脏信号比例：模型回报了非法/未注册 id 的比例。
    invalidRate: total ? round3(vs.invalid / total) : 0,
  };
}

function printTextReport(report) {
  const c = report.counts;
  console.log('Variant deviation evaluator (model self-select vs server fallback)');
  console.log(`total=${c.total} legalChoices=${report.legalChoices}`);
  console.log(`match=${c.match} deviate=${c.deviate} invalid=${c.invalid} absent=${c.absent}`);
  console.log(`deviationRate=${report.deviationRate} (deviate / (match + deviate))`);
  console.log(`adoptionRate=${report.adoptionRate} (legalChoices / total)`);
  console.log(`invalidRate=${report.invalidRate} (invalid / total)`);
  if (c.total === 0) {
    console.log('note: 暂无应用成功的交互样本，统计为空。');
  }
}

function printHelp() {
  console.log(`Usage: npm run eval:variant-deviation -- [options]

评估「模型自选变体 vs 服务端兜底建议」的偏离情况，用于衡量模型自选质量。
分类口径（仅统计真正应用成功的交互）：
  match    模型选了与兜底相同的合法变体
  deviate  模型选了另一个合法变体（自选生效）
  invalid  模型回报了非法/未注册 id（会回退兜底）
  absent   模型未回报合法 variantId（未使用自选机制）

Options:
  --json             以 JSON 输出完整报告。
  --help, -h         显示本帮助。`);
}

try {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printHelp();
    process.exit(0);
  }
  const report = evaluateVariantDeviation();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(report));
  } else {
    printTextReport(report);
  }
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
}
