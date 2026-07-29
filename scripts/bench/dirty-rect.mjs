/**
 * Why `useDirtyRect` is not enabled: it corrupts the initial draw, and it buys
 * nothing measurable in this plugin.
 *
 * Run manually — this is not wired into CI:
 *
 *   pnpm run bench:dirty-rect
 *
 * Two parts:
 *
 * 1. **Artifact repro.** Reproduces the mount sequence `EChart.tsx` produces —
 *    init at one size, `setOption` with animation on, then `chart.resize()` a
 *    moment later, because the resize effect fires right after the option effect.
 *    With `useDirtyRect: true` the region the resize exposes is left partly
 *    unpainted: zrender's dirty regions were computed against the pre-resize
 *    layout while an animation was still in flight. Writes PNGs so the difference
 *    can be seen rather than argued about. Turning animation off makes it
 *    disappear, which is what pinned the trigger.
 *
 *    Which elements go missing varies with what is animating: this repro loses
 *    the line paths while the point markers survive, whereas the report from
 *    Grafana was gridline gaps (blank rectangles where gridlines should be). Same
 *    root cause — stale dirty regions — different casualties, so do not treat the
 *    exact missing elements here as the signature to look for.
 *
 * 2. **Benefit measurement.** Times initial render, full-option updates, and
 *    hover highlight with the flag on and off. The result sits inside run-to-run
 *    variance and the sign is not stable across runs — the 500-series case has
 *    measured both +0.4% and -5.7% on initial render — so there is no reliable
 *    gain to weigh against the artifact. That is expected: the plugin calls
 *    `setOption(..., { notMerge: true })`, so every update replaces the whole
 *    option, every repaint invalidates everything, and there is no partial
 *    repaint for dirty-rect to skip.
 *
 * Conclusion recorded in docs/performance.md. If someone proposes enabling the
 * flag again, run this first.
 */
import { mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import playwright from '@playwright/test';

const require = createRequire(import.meta.url);
const { chromium } = playwright;
const echartsDist = require.resolve('echarts/dist/echarts.min.js');
const outDir = mkdtempSync(path.join(tmpdir(), 'echarts-dirty-rect-'));

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const browser = await chromium.launch({ args: ['--disable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1300, height: 700 } });
await page.setContent('<body style="margin:0;background:#fff"><div id="c"></div></body>');
await page.addScriptTag({ path: echartsDist });

await page.evaluate(() => {
  // getUPlotGridColor(theme), light theme — so the gridlines look like the plugin's.
  const GRID = 'rgba(38, 56, 77, 0.16)';
  const axis = {
    axisLine: { show: false },
    axisTick: { show: true, length: 4, lineStyle: { color: GRID } },
    splitLine: { show: true, lineStyle: { color: GRID } },
  };

  const reset = (el, useDirtyRect, w, h) => {
    const prev = window.echarts.getInstanceByDom(el);
    if (prev) {
      prev.dispose();
    }
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    return window.echarts.init(el, undefined, { useDirtyRect });
  };

  const lineSeries = (points, series, showSymbol) => {
    const t0 = 1700000000000;
    const time = Array.from({ length: points }, (_, i) => t0 + i * 3600000);
    return Array.from({ length: series }, (_, s) => ({
      name: `s${s}`,
      type: 'line',
      showSymbol,
      ...(points > 100 ? { sampling: 'lttb' } : {}),
      data: time.map((t, i) => [t, 50 + Math.sin((i + s * 3) / 4) * 40]),
    }));
  };

  const base = (animation) => ({
    animation,
    grid: { left: 50, right: 20, top: 20, bottom: 30 },
    xAxis: { type: 'time', ...axis },
    yAxis: { type: 'value', min: 0, max: 100, ...axis },
  });

  // --- Part 1: the artifact ---
  window.repro = ({ useDirtyRect, animation }) => {
    const el = document.getElementById('c');
    const chart = reset(el, useDirtyRect, 400, 250);
    chart.setOption({ ...base(animation), series: lineSeries(40, 3, true) }, { notMerge: true });
    // The resize effect in EChart.tsx lands here, mid-animation.
    setTimeout(() => {
      el.style.width = '900px';
      el.style.height = '450px';
      chart.resize({ width: 900, height: 450 });
    }, 120);
    return true;
  };

  // --- Part 2: the benefit ---
  window.measure = ({ useDirtyRect, series, points, updates }) => {
    const el = document.getElementById('c');
    const chart = reset(el, useDirtyRect, 1200, 600);
    const opt = base(false);
    const s = lineSeries(points, series, points <= 100);

    const t0 = performance.now();
    chart.setOption({ ...opt, series: s }, { notMerge: true });
    chart.getZr().refreshImmediately();
    const initial = performance.now() - t0;

    // Full-option updates: what the plugin actually does on every data change.
    const u0 = performance.now();
    for (let u = 0; u < updates; u++) {
      const shifted = s.map((x) => ({ ...x, data: x.data.map(([t, v]) => [t, v + (u % 2 ? 1 : -1)]) }));
      chart.setOption({ ...opt, series: shifted }, { notMerge: true });
      chart.getZr().refreshImmediately();
    }
    const updateMs = (performance.now() - u0) / updates;

    // Hover highlight: a small localised change, dirty-rect's best case.
    const h0 = performance.now();
    for (let i = 0; i < 10; i++) {
      chart.dispatchAction({ type: 'highlight', seriesIndex: 0, dataIndex: i });
      chart.getZr().refreshImmediately();
      chart.dispatchAction({ type: 'downplay', seriesIndex: 0, dataIndex: i });
      chart.getZr().refreshImmediately();
    }
    const hoverMs = (performance.now() - h0) / 20;

    return { initial, updateMs, hoverMs };
  };
});

// --- Part 1 ---
console.log('# Artifact repro (resize mid-animation, the EChart.tsx mount sequence)\n');
for (const [label, opts] of [
  ['dirtyRect-on__animation-on', { useDirtyRect: true, animation: true }],
  ['dirtyRect-off_animation-on', { useDirtyRect: false, animation: true }],
  ['dirtyRect-on__animation-off', { useDirtyRect: true, animation: false }],
]) {
  await page.evaluate((o) => window.repro(o), opts);
  await page.waitForTimeout(1800);
  const file = path.join(outDir, `${label}.png`);
  await page.locator('#c').screenshot({ path: file });
  console.log(`  ${file}`);
}
console.log(
  '\n  Compare them: dirtyRect-on__animation-on leaves the region the resize\n' +
    '  exposed partly unpainted (here the line paths are missing while the point\n' +
    '  markers survive). The other two are correct — which is how the trigger was\n' +
    '  pinned to "a resize while an animation is in flight". Which elements go\n' +
    '  missing varies; gridline gaps were what got reported from Grafana.\n'
);

// --- Part 2 ---
console.log('# Benefit measurement (median of 5, ms, lower is better)\n');
for (const sc of [
  { label: '500 series x 100 pts', series: 500, points: 100 },
  { label: '20 series x 5000 pts', series: 20, points: 5000 },
  { label: '1 series x 100000 pts', series: 1, points: 100000 },
]) {
  console.log(`### ${sc.label}`);
  const out = {};
  for (const useDirtyRect of [true, false]) {
    const runs = [];
    for (let i = 0; i < 5; i++) {
      runs.push(await page.evaluate((o) => window.measure(o), { ...sc, useDirtyRect, updates: 3 }));
    }
    out[useDirtyRect] = {
      initial: median(runs.map((r) => r.initial)),
      updateMs: median(runs.map((r) => r.updateMs)),
      hoverMs: median(runs.map((r) => r.hoverMs)),
    };
    const o = out[useDirtyRect];
    console.log(
      `  dirtyRect=${String(useDirtyRect).padEnd(5)}  initial ${o.initial.toFixed(1).padStart(8)}  ` +
        `update ${o.updateMs.toFixed(1).padStart(8)}  hover ${o.hoverMs.toFixed(2).padStart(7)}`
    );
  }
  const pct = (a, b) => `${(((a - b) / b) * 100).toFixed(1)}%`;
  console.log(
    `  -> dirtyRect effect: initial ${pct(out[true].initial, out[false].initial)}, ` +
      `update ${pct(out[true].updateMs, out[false].updateMs)}, ` +
      `hover ${pct(out[true].hoverMs, out[false].hoverMs)} (negative = dirtyRect faster)\n`
  );
}

await browser.close();
