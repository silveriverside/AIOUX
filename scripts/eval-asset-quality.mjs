import { getMemorySnapshot, scoreAssetQuality } from '../server/memory.js';

function resolveNow() {
  const override = Number(process.env.AIOUX_ASSET_QUALITY_NOW || 0);
  return override > 0 ? override : Date.now();
}

function parseLimit(argv = process.argv.slice(2)) {
  const inlineArg = argv.find((item) => item.startsWith('--limit='));
  const limitIndex = argv.indexOf('--limit');
  const spacedArg = limitIndex >= 0 ? argv[limitIndex + 1] : null;
  const rawValue = inlineArg ? inlineArg.slice('--limit='.length) : spacedArg;
  if (!rawValue) {
    if (inlineArg || limitIndex >= 0) {
      throw new Error('Invalid --limit: expected a positive integer');
    }
    return null;
  }
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error('Invalid --limit: expected a positive integer');
  }
  return value;
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

function evaluateAssetQuality({ now = resolveNow(), limit = parseLimit() } = {}) {
  const snapshot = getMemorySnapshot();
  const allAssets = Object.values(snapshot.assets || {})
    .map((asset) => ({
      assetKey: asset.assetKey || '',
      url: asset.url || '',
      type: asset.type || null,
      usedByNodes: Array.isArray(asset.usedByNodes) ? asset.usedByNodes : [],
      useCount: Number(asset.useCount || 0),
      lastUsedAt: asset.lastUsedAt || null,
      quality: scoreAssetQuality(asset, { now }),
    }))
    .sort((a, b) => b.quality.score - a.quality.score || a.url.localeCompare(b.url));
  const assets = limit ? allAssets.slice(0, limit) : allAssets;
  const totalScore = allAssets.reduce((sum, asset) => sum + asset.quality.score, 0);

  return {
    total: allAssets.length,
    limit,
    generatedAt: now,
    summary: {
      topScore: allAssets[0]?.quality.score || 0,
      averageScore: allAssets.length ? round3(totalScore / allAssets.length) : 0,
    },
    assets,
  };
}

function printTextReport(report) {
  console.log('Asset quality evaluator');
  console.log(`total=${report.total}`);
  console.log(`averageScore=${report.summary.averageScore}`);
  const top = report.assets[0];
  if (top) {
    console.log(`top=${top.url} score=${top.quality.score}`);
  }
  for (const asset of report.assets.slice(0, 10)) {
    console.log(`asset=${asset.url} score=${asset.quality.score} use=${asset.quality.components.use} coverage=${asset.quality.components.coverage} recency=${asset.quality.components.recency}`);
  }
}

function printHelp() {
  console.log(`Usage: npm run eval:asset-quality -- [options]

Options:
  --json             Output the full report as JSON.
  --limit=N          Return only the top N assets while keeping total as the full count.
  --limit N          Same as --limit=N.
  --help, -h         Show this help message.`);
}

try {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printHelp();
    process.exit(0);
  }
  const report = evaluateAssetQuality();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(report));
  } else {
    printTextReport(report);
  }
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
}
