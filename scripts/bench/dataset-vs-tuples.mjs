/**
 * Benchmark: inline `[time, value]` tuples vs a columnar `option.dataset` +
 * per-series `encode` vs interleaved typed arrays (`SOURCE_FORMAT_TYPED_ARRAY`),
 * and what the performance levers are worth on top of each.
 *
 * Run manually — this is not wired into CI:
 *
 *   pnpm run bench:dataset
 *
 * Why it is built the way it is (preserve these properties if you change it):
 *
 * - The performance levers are held IDENTICAL on both sides of each pair, so the
 *   delta attributable to the data path is isolated from them.
 * - Timing runs to ECharts' own `finished` event rather than to `setOption`
 *   returning. With animation on, most of the work happens after `setOption`
 *   returns, so timing the call under-counts the animated variant badly.
 * - The rendered canvas is hashed on both sides and compared. A variant that
 *   silently renders less would otherwise look faster.
 * - Frames are generated once per scenario and shared by every variant, so the
 *   numbers never include data generation.
 *
 * Results and the conclusion drawn from them: docs/dataset.md, docs/performance.md.
 */
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import playwright from '@playwright/test';

const require = createRequire(import.meta.url);
const { chromium } = playwright;

const benchDir = path.dirname(fileURLToPath(import.meta.url));
// Injected into the page rather than copied next to bench.html, so the benchmark
// always measures the ECharts version this repo actually depends on.
const echartsDist = require.resolve('echarts/dist/echarts.min.js');

const SCENARIOS = [
  // The profiled regression: 500 series, one frame each.
  { key: 'multi500x100', label: '500 series x 100 pts (500 frames)', frames: 500, fieldsPerFrame: 1, points: 100 },
  // Same series count, one wide frame -> the shape where a dataset can actually
  // share the time column across all 500 series. Also the shape whose tooltips
  // the dataset path breaks (see dataset-tooltip-probe.mjs).
  { key: 'wide500x100', label: '500 series x 100 pts (1 wide frame)', frames: 1, fieldsPerFrame: 500, points: 100 },
  // 500 series with real depth -- 500k points total, closest to the ~4.5s profile.
  { key: 'multi500x1000', label: '500 series x 1000 pts (500 frames)', frames: 500, fieldsPerFrame: 1, points: 1000 },
  // Dense: fewer series, many points each.
  { key: 'dense20x5000', label: '20 series x 5000 pts', frames: 20, fieldsPerFrame: 1, points: 5000 },
  // Single very dense series.
  { key: 'single1x100k', label: '1 series x 100000 pts', frames: 1, fieldsPerFrame: 1, points: 100000 },
];

const VARIANTS = [
  { key: 'main', label: 'tuples, no perf opts', path: 'tuples', perf: false },
  { key: 'tuples+perf', label: 'tuples + perf opts', path: 'tuples', perf: true },
  { key: 'typed', label: 'typed arrays, no perf opts', path: 'typed', perf: false },
  { key: 'typed+perf', label: 'typed arrays + perf opts', path: 'typed', perf: true },
  { key: 'dataset', label: 'dataset, no perf opts', path: 'dataset', perf: false },
  { key: 'dataset+perf', label: 'dataset + perf opts', path: 'dataset', perf: true },
];

const WARMUP = 2;
const ITERATIONS = 7;

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const browser = await chromium.launch({
  args: ['--enable-precise-memory-info', '--js-flags=--expose-gc', '--disable-gpu'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const cdp = await page.context().newCDPSession(page);
await cdp.send('HeapProfiler.enable');

await page.goto(`file://${path.join(benchDir, 'bench.html')}`);
await page.addScriptTag({ path: echartsDist });
await page.waitForFunction(() => window.__ready === true);

const results = [];
const pixelChecks = [];

for (const sc of SCENARIOS) {
  process.stderr.write(`\n### ${sc.label}\n`);
  await page.evaluate((spec) => window.makeScenario(spec), sc);

  // Correctness control: do the data paths paint the same pixels?
  const shots = {};
  for (const v of [VARIANTS[1], VARIANTS[3], VARIANTS[5]]) {
    await page.evaluate(([s, vv]) => window.renderStill(s, vv), [sc, v]);
    const buf = await page.locator('#c').screenshot();
    shots[v.key] = createHash('sha256').update(buf).digest('hex').slice(0, 16);
  }
  const typedIdentical = shots['tuples+perf'] === shots['typed+perf'];
  const datasetIdentical = shots['tuples+perf'] === shots['dataset+perf'];
  pixelChecks.push({ scenario: sc.key, typedIdentical, datasetIdentical, ...shots });
  process.stderr.write(
    `  [pixel check] tuples vs typed: ${typedIdentical ? 'IDENTICAL' : 'DIFFERENT'}  ` +
      `tuples vs dataset: ${datasetIdentical ? 'IDENTICAL' : 'DIFFERENT'}\n`
  );

  for (const v of VARIANTS) {
    const runs = [];
    for (let i = 0; i < WARMUP + ITERATIONS; i++) {
      await cdp.send('HeapProfiler.collectGarbage');
      await page.waitForTimeout(60);
      const r = await page.evaluate(([s, vv]) => window.runOnce(s, vv), [sc, v]);
      if (i >= WARMUP) {
        runs.push(r);
      }
    }
    const agg = {
      scenario: sc.key,
      scenarioLabel: sc.label,
      variant: v.key,
      variantLabel: v.label,
      buildMs: median(runs.map((r) => r.buildMs)),
      setOptionMs: median(runs.map((r) => r.setOptionMs)),
      finishedMs: median(runs.map((r) => r.finishedMs)),
      heapBuildMB: median(runs.map((r) => r.heapBuildBytes)) / 1048576,
      heapTotalMB: median(runs.map((r) => r.heapTotalBytes)) / 1048576,
    };
    results.push(agg);
    process.stderr.write(
      `  ${v.key.padEnd(14)} build ${agg.buildMs.toFixed(1).padStart(7)}ms  ` +
        `setOption ${agg.setOptionMs.toFixed(1).padStart(7)}ms  ` +
        `FINISHED ${agg.finishedMs.toFixed(1).padStart(8)}ms  ` +
        `heap(build) ${agg.heapBuildMB.toFixed(1).padStart(6)}MB  ` +
        `heap(all) ${agg.heapTotalMB.toFixed(1).padStart(7)}MB\n`
    );
  }

  // Isolated data-path deltas, same perf settings on both sides of a pair.
  const get = (vk) => results.find((r) => r.scenario === sc.key && r.variant === vk);
  for (const [a, b, lbl] of [
    ['main', 'dataset', 'dataset, animation on '],
    ['tuples+perf', 'dataset+perf', 'dataset, perf opts on '],
    ['main', 'typed', 'typed, animation on  '],
    ['tuples+perf', 'typed+perf', 'typed, perf opts on  '],
  ]) {
    const ra = get(a);
    const rb = get(b);
    const d = rb.finishedMs - ra.finishedMs;
    const pct = (d / ra.finishedMs) * 100;
    process.stderr.write(
      `  -> ${lbl} delta: ${d >= 0 ? '+' : ''}${d.toFixed(1)}ms ` +
        `(${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)  heap ${(rb.heapTotalMB - ra.heapTotalMB).toFixed(1)}MB\n`
    );
  }

  await page.evaluate((k) => window.dropScenario(k), sc.key);
}

await browser.close();

// Machine-readable results on stdout; the human-readable log above is stderr, so
// `pnpm run bench:dataset > results.json` keeps both usable.
console.log(JSON.stringify({ results, pixelChecks }, null, 2));
