/** Measure complete Relations option replacements in Chromium. */
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import playwright from '@playwright/test';

const require = createRequire(import.meta.url);
const { chromium } = playwright;
const outputDirectory = mkdtempSync(path.join(tmpdir(), 'echarts-relations-refresh-'));
const bundles = [
  { name: 'development', path: require.resolve('echarts/dist/echarts.js') },
  { name: 'production', path: require.resolve('echarts/dist/echarts.min.js') },
];

const scenarios = [
  ...[150, 200, 225, 250].flatMap((nodes) =>
    [1, 2].map((density) => ({
      name: `force-${nodes}n-${nodes * density}e`,
      type: 'force',
      nodes,
      links: nodes * density,
    }))
  ),
  { name: 'force-500-marks', type: 'force', nodes: 200, links: 300 },
  { name: 'circular-750-marks', type: 'circular', nodes: 375, links: 375 },
  { name: 'circular-1000-marks', type: 'circular', nodes: 500, links: 500 },
  { name: 'fixed-750-marks', type: 'fixed', nodes: 375, links: 375 },
  { name: 'fixed-1000-marks', type: 'fixed', nodes: 500, links: 500 },
  { name: 'sankey-300-marks', type: 'sankey', nodes: 100, links: 200 },
  { name: 'sankey-400-marks', type: 'sankey', nodes: 100, links: 300 },
  { name: 'chord-150-marks', type: 'chord', nodes: 40, links: 110 },
  { name: 'chord-200-marks', type: 'chord', nodes: 40, links: 160 },
];

const makeGraph = ({ nodes: nodeCount, links: linkCount, type }) => {
  const nodes = Array.from({ length: nodeCount }, (_, index) => ({
    id: `n${index}`,
    name: `Node ${index}`,
    value: 1,
    x: Math.cos((index / nodeCount) * Math.PI * 2) * 300,
    y: Math.sin((index / nodeCount) * Math.PI * 2) * 220,
  }));
  const links = [];
  const seen = new Set();
  for (let distance = 1; links.length < linkCount; distance++) {
    for (let source = 0; source < nodeCount && links.length < linkCount; source++) {
      const target = type === 'sankey' ? source + distance : (source + distance) % nodeCount;
      if (target >= nodeCount) {
        continue;
      }
      const key = `${source}:${target}`;
      if (source !== target && !seen.has(key)) {
        seen.add(key);
        links.push({ source: `n${source}`, target: `n${target}`, value: 1 });
      }
    }
  }
  return { nodes, links };
};

const percentile = (values, fraction) => {
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower] * (1 - (position - lower)) + sorted[upper] * (position - lower);
};

const browser = await chromium.launch({ args: ['--disable-gpu'] });
const results = [];
try {
  for (const bundle of bundles) {
    const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
    await page.setContent('<div id="chart" style="width:1000px;height:700px"></div>');
    await page.addScriptTag({ path: bundle.path });

    for (const scenario of scenarios) {
      const graph = makeGraph(scenario);
      const result = await page.evaluate(
        async ({ graph, scenario }) => {
          const chart = window.echarts.init(document.getElementById('chart'), null, { renderer: 'canvas' });
          const longTasks = [];
          const observer = new PerformanceObserver((list) =>
            longTasks.push(...list.getEntries().map((entry) => entry.duration))
          );
          observer.observe({ type: 'longtask' });

          const series = () => {
            if (scenario.type === 'sankey') {
              return { type: 'sankey', data: graph.nodes, links: graph.links, layoutIterations: 32, animation: false };
            }
            if (scenario.type === 'chord') {
              return { type: 'chord', data: graph.nodes, links: graph.links, animation: false };
            }
            return {
              type: 'graph',
              data: graph.nodes,
              links: graph.links,
              layout: scenario.type === 'fixed' ? 'none' : scenario.type,
              animation: false,
              force:
                scenario.type === 'force'
                  ? { initLayout: 'none', layoutAnimation: false, friction: 0.2, repulsion: 120, edgeLength: 50 }
                  : undefined,
            };
          };

          const durations = [];
          const started = performance.now();
          for (let index = 0; index < 9; index++) {
            const before = performance.now();
            chart.setOption({ animation: false, series: [series()] }, { notMerge: true });
            const duration = performance.now() - before;
            if (index >= 2) {
              durations.push(duration);
            }
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          }
          await new Promise((resolve) => setTimeout(resolve, 0));
          observer.disconnect();
          const seriesModel = chart.getModel().getSeriesByIndex(0);
          const seriesGraph = seriesModel.getGraph?.();
          const nodeGraphicCount = seriesModel.getData().count();
          const linkGraphicCount = seriesGraph?.edgeData.count() ?? scenario.links;
          const dataUrl = chart.getDataURL({ pixelRatio: 1, backgroundColor: '#ffffff' });
          chart.dispose();
          return {
            durations,
            longTaskMax: Math.max(0, ...longTasks),
            settleTime: performance.now() - started,
            nodeGraphicCount,
            linkGraphicCount,
            dataUrl,
          };
        },
        { graph, scenario }
      );
      const png = Buffer.from(result.dataUrl.split(',')[1], 'base64');
      const pngPath = path.join(outputDirectory, `${bundle.name}-${scenario.name}.png`);
      writeFileSync(pngPath, png);
      results.push({
        bundle: bundle.name,
        scenario: scenario.name,
        nodes: scenario.nodes,
        links: scenario.links,
        p50: percentile(result.durations, 0.5),
        p95: percentile(result.durations, 0.95),
        max: Math.max(...result.durations),
        longTaskMax: result.longTaskMax,
        settleTime: result.settleTime,
        nodeGraphicCount: result.nodeGraphicCount,
        linkGraphicCount: result.linkGraphicCount,
        canvasHash: createHash('sha256').update(png).digest('hex'),
        pngPath,
      });
    }
    await page.close();
  }
} finally {
  await browser.close();
}

const resultPath = path.join(outputDirectory, 'results.json');
writeFileSync(resultPath, `${JSON.stringify(results, null, 2)}\n`);
for (const { bundle, scenario, p50, p95, max, longTaskMax, nodeGraphicCount, linkGraphicCount } of results) {
  console.log(
    `${bundle} ${scenario}: p50=${p50.toFixed(1)} ms p95=${p95.toFixed(1)} ms max=${max.toFixed(1)} ms longTaskMax=${longTaskMax.toFixed(1)} ms nodes=${nodeGraphicCount} links=${linkGraphicCount}`
  );
}
console.log(`Results: ${resultPath}`);
