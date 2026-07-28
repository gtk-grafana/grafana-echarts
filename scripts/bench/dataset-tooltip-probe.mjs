/**
 * Probe: what a series' `params.value` actually contains under a columnar
 * `option.dataset`, and what `unwrapTooltipValue` makes of it.
 *
 * Run manually — this is not wired into CI:
 *
 *   pnpm run bench:dataset-tooltip
 *
 * This is the evidence behind the "failure mode, confirmed" section of
 * docs/dataset.md, kept because it is the decisive argument against adopting
 * `dataset` and because it is the sort of claim that is easy to reason about
 * wrongly. It drives a real axis-triggered tooltip on a real ECharts instance
 * rather than hand-constructing a `params` object — which is precisely why the
 * repo's ~35 existing tooltip assertions do not catch this.
 *
 * Expected output: under `dataset`, series A and B report series C's value,
 * because ECharts assembles each raw item across every declared dimension and
 * `unwrapTooltipValue` takes the last element.
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import playwright from '@playwright/test';

const require = createRequire(import.meta.url);
const { chromium } = playwright;

const benchDir = path.dirname(fileURLToPath(import.meta.url));
const echartsDist = require.resolve('echarts/dist/echarts.min.js');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`file://${path.join(benchDir, 'bench.html')}`);
await page.addScriptTag({ path: echartsDist });
await page.waitForFunction(() => window.__ready === true);

const captured = await page.evaluate(() => {
  // A wide frame: one time column + THREE value fields, the shape Grafana's
  // wide-format time series produces. Distinct constant values per series so the
  // tooltip payload is unambiguous.
  const time = [1700000000000, 1700000010000, 1700000020000];
  const cols = { time, v0: [10, 10, 10], v1: [20, 20, 20], v2: [30, 30, 30] };
  const capture = { dataset: [], tuples: [] };

  function run(mode) {
    const chart = window.echarts.init(document.getElementById('c'));
    const common = (name) => ({ name, type: 'line', symbolSize: 20 });
    chart.setOption(
      {
        animation: false,
        xAxis: { type: 'time' },
        yAxis: { type: 'value', min: 0, max: 40 },
        tooltip: {
          trigger: 'axis',
          formatter: (params) => {
            params.forEach((p) => {
              capture[mode].push({
                seriesName: p.seriesName,
                // Exactly what src/lib/echarts/tooltip/template.ts does:
                //   Array.isArray(v) ? v[v.length - 1] : v
                unwrapped: Array.isArray(p.value) ? p.value[p.value.length - 1] : p.value,
                rawValue: JSON.stringify(p.value),
                encodeY: p.encode ? JSON.stringify(p.encode.y) : null,
                dimensionNames: p.dimensionNames ? JSON.stringify(p.dimensionNames) : null,
              });
            });
            return 'x';
          },
        },
        ...(mode === 'dataset'
          ? {
              dataset: [{ source: cols }],
              series: [
                { ...common('A'), datasetIndex: 0, encode: { x: 'time', y: 'v0' } },
                { ...common('B'), datasetIndex: 0, encode: { x: 'time', y: 'v1' } },
                { ...common('C'), datasetIndex: 0, encode: { x: 'time', y: 'v2' } },
              ],
            }
          : {
              series: [
                { ...common('A'), data: time.map((t, i) => [t, cols.v0[i]]) },
                { ...common('B'), data: time.map((t, i) => [t, cols.v1[i]]) },
                { ...common('C'), data: time.map((t, i) => [t, cols.v2[i]]) },
              ],
            }),
      },
      { notMerge: true }
    );
    // Drive a real axis-trigger tooltip at the middle data point.
    chart.dispatchAction({ type: 'showTip', seriesIndex: 0, dataIndex: 1 });
    chart.dispose();
  }

  run('tuples');
  run('dataset');
  return capture;
});

await browser.close();

const TRUTH = { A: 10, B: 20, C: 30 };
let wrong = 0;

for (const mode of ['tuples', 'dataset']) {
  console.log(`\n--- ${mode} ---   (truth: A=10, B=20, C=30)`);
  for (const r of captured[mode]) {
    const ok = r.unwrapped === TRUTH[r.seriesName];
    if (!ok) {
      wrong++;
    }
    console.log(
      `  ${r.seriesName}  unwrapTooltipValue -> ${String(r.unwrapped).padStart(3)}  ${ok ? 'OK  ' : 'WRONG'}` +
        `  params.value=${r.rawValue}  encode.y=${r.encodeY}  dims=${r.dimensionNames}`
    );
  }
}

console.log(
  `\n${wrong} of ${captured.tuples.length + captured.dataset.length} tooltip reads resolved to the wrong series.`
);
console.log('Correct resolution would go through params.encode.y[0] + params.dimensionNames. See docs/dataset.md.');
