/**
 * Measure force-graph resize work in real Chromium.
 *
 * Run manually:
 *
 *   pnpm run bench:force-resize
 *
 * The benchmark writes its complete JSON result to a temporary directory. It
 * exits nonzero only when ECharts does not finish or produces invalid output.
 */
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import playwright from '@playwright/test';

const require = createRequire(import.meta.url);
const { chromium } = playwright;
const echartsDist = require.resolve('echarts/dist/echarts.min.js');
const outputDirectory = mkdtempSync(path.join(tmpdir(), 'echarts-force-resize-'));
const rawResultPath = path.join(outputDirectory, 'results.json');
const RUN_TIMEOUT_MS = 300_000;
const ACTIVE_STEP_TARGET_MS = 50;

const scenarios = [
  { name: '12 nodes / 11 edges', nodeCount: 12, edgeCount: 11 },
  { name: '100 nodes / 200 edges', nodeCount: 100, edgeCount: 200 },
  { name: '500 nodes / 499 edges', nodeCount: 500, edgeCount: 499 },
];

const paths = [
  {
    name: 'full-option-and-resize',
    description: 'A configured full option replacement and resize on every step.',
  },
  {
    name: 'resize-only-final-option',
    description: 'Resize every step, then apply one final configured option.',
  },
  {
    name: 'animated-option-final-option',
    description:
      'Merge the transient force settings during the burst, then apply one final configured full option.',
  },
];

const makeGraph = ({ nodeCount, edgeCount }) => {
  const nodes = Array.from({ length: nodeCount }, (_, index) => ({
    id: `node-${index}`,
    name: `Node ${index}`,
    value: 1,
  }));
  const links = [];
  const seen = new Set();

  const addLink = (sourceIndex, targetIndex) => {
    const source = sourceIndex % nodeCount;
    const target = targetIndex % nodeCount;
    const key = `${source}:${target}`;
    if (source === target || seen.has(key)) {
      return;
    }
    seen.add(key);
    links.push({ source: nodes[source].id, target: nodes[target].id, value: 1 });
  };

  for (let index = 0; links.length < edgeCount && index < nodeCount - 1; index++) {
    addLink(index, index + 1);
  }
  for (let stride = 2; links.length < edgeCount; stride++) {
    for (let index = 0; index < nodeCount && links.length < edgeCount; index++) {
      addLink(index, index + stride);
    }
  }

  if (links.length !== edgeCount) {
    throw new Error(`Could not generate ${edgeCount} unique links for ${nodeCount} nodes.`);
  }
  return { nodes, links };
};

const graphs = Object.fromEntries(scenarios.map((scenario) => [scenario.name, makeGraph(scenario)]));
const browser = await chromium.launch({ args: ['--disable-gpu'] });

const withTimeout = (promise, label) => {
  let timeout;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error(`${label} exceeded ${RUN_TIMEOUT_MS} ms.`)), RUN_TIMEOUT_MS);
    }),
  ]).finally(() => clearTimeout(timeout));
};

try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  await page.setContent('<body style="margin:0;background:#fff"><div id="chart"></div></body>');
  await page.addScriptTag({ path: echartsDist });

  await page.evaluate(
    ({ scenarioGraphs, resizePaths }) => {
      const START_SIZE = { width: 400, height: 300 };
      const END_SIZE = { width: 800, height: 500 };
      const RESIZE_STEPS = 60;
      const NODE_DIAMETER = 20;
      const FORCE_EDGE_PADDING = 16;
      const SETTLE_TIMEOUT_MS = 120_000;
      const CONFIGURED_LAYOUT_ANIMATION = false;

      const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
      const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
      const resetRandom = () => {
        let state = 0x6d2b79f5;
        Math.random = () => {
          state += 0x6d2b79f5;
          let value = state;
          value = Math.imul(value ^ (value >>> 15), value | 1);
          value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
          return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
        };
      };

      const percentile = (values, fraction) => {
        const sorted = [...values].sort((left, right) => left - right);
        const position = (sorted.length - 1) * fraction;
        const lowerIndex = Math.floor(position);
        const upperIndex = Math.ceil(position);
        const weight = position - lowerIndex;
        return sorted[lowerIndex] * (1 - weight) + sorted[upperIndex] * weight;
      };

      const getForce = (graph, width, height) => {
        const reservedSpace = NODE_DIAMETER + 2 * FORCE_EDGE_PADDING;
        const usableWidth = Math.max(1, width - reservedSpace);
        const usableHeight = Math.max(1, height - reservedSpace);
        const columns = Math.ceil(Math.sqrt((graph.nodes.length * usableWidth) / usableHeight));
        const rows = Math.ceil(graph.nodes.length / columns);
        const gridSpacing = Math.min(usableWidth / Math.max(1, columns), usableHeight / Math.max(1, rows));
        const averageDegree = (2 * graph.links.length) / Math.max(1, graph.nodes.length);
        const connectedness = clamp(graph.links.length / Math.max(1, graph.nodes.length - 1), 0, 1);
        const degreeScale = 0.75 + 0.1 * Math.min(averageDegree, 5);
        const edgeLength = clamp(gridSpacing * degreeScale, 30, 240);
        const repulsion = clamp(edgeLength * clamp(2 + averageDegree * 0.5, 2, 4), 60, 960);
        const crowding = 1 - clamp(gridSpacing / (NODE_DIAMETER + 2 * FORCE_EDGE_PADDING), 0, 1);
        const gravity = clamp(0.2 + (1 - connectedness) * 0.2 + crowding * 0.1, 0.2, 0.5);

        return {
          initLayout: 'none',
          edgeLength,
          repulsion,
          gravity,
          layoutAnimation: CONFIGURED_LAYOUT_ANIMATION,
          friction: 0.2,
        };
      };

      const buildOption = (graph, width, height) => ({
        animation: false,
        series: [
          {
            type: 'graph',
            layout: 'force',
            force: getForce(graph, width, height),
            symbolSize: NODE_DIAMETER,
            label: { show: false },
            lineStyle: { width: 1, opacity: 0.6 },
            data: graph.nodes,
            links: graph.links,
          },
        ],
      });

      const getSeriesState = (chart) => {
        const series = chart.getModel()?.getSeriesByIndex(0);
        const view = series ? chart.getViewOfSeriesModel(series) : null;
        return { series, view };
      };

      const isWorkComplete = (chart) => {
        const { series, view } = getSeriesState(chart);
        return Boolean(
          series &&
            view &&
            !view._layouting &&
            !chart._scheduler?.unfinished &&
            chart.getZr().animation.isFinished()
        );
      };

      const waitForCompletedWork = async (chart) => {
        const start = performance.now();
        let stableFrames = 0;
        while (performance.now() - start < SETTLE_TIMEOUT_MS) {
          await nextFrame();
          if (isWorkComplete(chart)) {
            stableFrames++;
            if (stableFrames === 2) {
              chart.getZr().refreshImmediately();
              return performance.now() - start;
            }
          } else {
            stableFrames = 0;
          }
        }
        throw new Error(`ECharts did not finish within ${SETTLE_TIMEOUT_MS} ms.`);
      };

      const canvasHashInput = (chart) => chart.renderToCanvas({ pixelRatio: 1 }).toDataURL('image/png');

      const inspectOutput = (chart, expected, width, height) => {
        const { series, view } = getSeriesState(chart);
        if (!series || !view || view._layouting) {
          throw new Error('The final graph view is missing or its force layout is incomplete.');
        }

        const nodeData = series.getData();
        const edgeData = series.getEdgeData();
        const configuredForce = series.option.force;
        const nodeBounds = [];
        let missingNodeMarks = 0;
        let missingEdgeMarks = 0;

        for (let index = 0; index < nodeData.count(); index++) {
          const group = nodeData.getItemGraphicEl(index);
          const symbol = group?.getSymbolPath?.();
          if (!symbol) {
            missingNodeMarks++;
            continue;
          }
          const rectangle = symbol.getBoundingRect().clone();
          rectangle.applyTransform(symbol.getComputedTransform());
          nodeBounds.push({
            x: rectangle.x,
            y: rectangle.y,
            width: rectangle.width,
            height: rectangle.height,
          });
        }

        for (let index = 0; index < edgeData.count(); index++) {
          if (!edgeData.getItemGraphicEl(index)) {
            missingEdgeMarks++;
          }
        }

        if (nodeData.count() !== expected.nodeCount || edgeData.count() !== expected.edgeCount) {
          throw new Error(
            `Final data count was ${nodeData.count()}/${edgeData.count()}, expected ${expected.nodeCount}/${expected.edgeCount}.`
          );
        }
        if (missingNodeMarks || missingEdgeMarks) {
          throw new Error(`Final output is missing ${missingNodeMarks} node marks and ${missingEdgeMarks} edge marks.`);
        }
        if (
          configuredForce?.initLayout !== 'none' ||
          configuredForce?.friction !== 0.2 ||
          configuredForce?.layoutAnimation !== CONFIGURED_LAYOUT_ANIMATION
        ) {
          throw new Error('The final force settings do not match the configured option.');
        }
        if (
          nodeBounds.length !== expected.nodeCount ||
          nodeBounds.some((rectangle) =>
            [rectangle.x, rectangle.y, rectangle.width, rectangle.height].some((value) => !Number.isFinite(value))
          )
        ) {
          throw new Error('Final node bounds are incomplete or non-finite.');
        }

        const tolerance = 0.5;
        const outside = nodeBounds.filter(
          (rectangle) =>
            rectangle.x < -tolerance ||
            rectangle.y < -tolerance ||
            rectangle.x + rectangle.width > width + tolerance ||
            rectangle.y + rectangle.height > height + tolerance
        );
        const extents = nodeBounds.reduce(
          (result, rectangle) => ({
            minimumX: Math.min(result.minimumX, rectangle.x),
            minimumY: Math.min(result.minimumY, rectangle.y),
            maximumX: Math.max(result.maximumX, rectangle.x + rectangle.width),
            maximumY: Math.max(result.maximumY, rectangle.y + rectangle.height),
          }),
          { minimumX: Infinity, minimumY: Infinity, maximumX: -Infinity, maximumY: -Infinity }
        );

        return {
          complete: true,
          nodeMarks: nodeData.count(),
          edgeMarks: edgeData.count(),
          configuredForce: {
            initLayout: configuredForce.initLayout,
            friction: configuredForce.friction,
            layoutAnimation: configuredForce.layoutAnimation,
          },
          nodeBounds: {
            allInside: outside.length === 0,
            outsideCount: outside.length,
            extents,
          },
        };
      };

      window.forceResizeBenchmark = {
        async run(scenario, pathName) {
          const graph = scenarioGraphs[scenario.name];
          const container = document.getElementById('chart');
          const priorChart = window.echarts.getInstanceByDom(container);
          priorChart?.dispose();
          container.style.width = `${START_SIZE.width}px`;
          container.style.height = `${START_SIZE.height}px`;

          const chart = window.echarts.init(container, undefined, {
            renderer: 'canvas',
            devicePixelRatio: 1,
          });
          let setOptionCount = 0;
          let resizeCount = 0;
          const setFullOption = (option) => {
            setOptionCount++;
            chart.setOption(option, { notMerge: true });
          };
          const setAnimatedForce = () => {
            setOptionCount++;
            chart.setOption({
              series: [{ type: 'graph', force: { layoutAnimation: true, friction: 0.05, initLayout: 'none' } }],
            });
          };
          const resize = (size) => {
            resizeCount++;
            chart.resize(size);
          };

          resetRandom();
          setFullOption(buildOption(graph, START_SIZE.width, START_SIZE.height));
          await waitForCompletedWork(chart);

          const stepTimes = [];
          const totalStart = performance.now();
          for (let index = 0; index < RESIZE_STEPS; index++) {
            await nextFrame();
            const progress = (index + 1) / RESIZE_STEPS;
            const size = {
              width: START_SIZE.width + (END_SIZE.width - START_SIZE.width) * progress,
              height: START_SIZE.height + (END_SIZE.height - START_SIZE.height) * progress,
            };
            container.style.width = `${size.width}px`;
            container.style.height = `${size.height}px`;

            const stepStart = performance.now();
            if (pathName === 'full-option-and-resize') {
              setFullOption(buildOption(graph, size.width, size.height));
              resize(size);
            } else if (pathName === 'resize-only-final-option') {
              resize(size);
            } else if (pathName === 'animated-option-final-option') {
              setAnimatedForce();
              resize(size);
            } else {
              throw new Error(`Unknown benchmark path: ${pathName}`);
            }
            stepTimes.push(performance.now() - stepStart);
          }

          if (pathName !== 'full-option-and-resize') {
            resetRandom();
            setFullOption(buildOption(graph, END_SIZE.width, END_SIZE.height));
          }
          const finalSettleMs = await waitForCompletedWork(chart);
          const totalSettleMs = performance.now() - totalStart;
          const validation = inspectOutput(chart, scenario, END_SIZE.width, END_SIZE.height);
          const canvasDataUrl = canvasHashInput(chart);

          return {
            scenario: scenario.name,
            path: pathName,
            syncStepMs: {
              p50: percentile(stepTimes, 0.5),
              p95: percentile(stepTimes, 0.95),
              maximum: Math.max(...stepTimes),
            },
            totalSettleMs,
            finalSettleMs,
            setOptionCount,
            resizeCount,
            validation,
            canvasDataUrl,
          };
        },
        paths: resizePaths,
      };
    },
    { scenarioGraphs: graphs, resizePaths: paths }
  );

  const results = [];
  for (const scenario of scenarios) {
    for (const resizePath of paths) {
      process.stdout.write(`Running ${scenario.name}: ${resizePath.name} ... `);
      const result = await withTimeout(
        page.evaluate(
          ({ benchmarkScenario, pathName }) => window.forceResizeBenchmark.run(benchmarkScenario, pathName),
          { benchmarkScenario: scenario, pathName: resizePath.name }
        ),
        `${scenario.name}: ${resizePath.name}`
      );
      const canvasBytes = Buffer.from(result.canvasDataUrl.split(',', 2)[1], 'base64');
      result.finalCanvasHash = createHash('sha256').update(canvasBytes).digest('hex');
      result.canvasBytes = canvasBytes.length;
      result.finalCanvasPath = path.join(
        outputDirectory,
        `${scenario.nodeCount}-nodes-${scenario.edgeCount}-edges--${resizePath.name}.png`
      );
      writeFileSync(result.finalCanvasPath, canvasBytes);
      delete result.canvasDataUrl;
      results.push(result);
      console.log('done');
    }
  }

  const animatedResults = results.filter((result) => result.path === 'animated-option-final-option');
  const resizeOnlyResults = results.filter((result) => result.path === 'resize-only-final-option');
  const animatedMeetsTarget = animatedResults.every(
    (result) => result.validation.complete && result.syncStepMs.maximum <= ACTIVE_STEP_TARGET_MS
  );
  const animatedMatchesResizeOnly = animatedResults.every((animatedResult) => {
    const resizeOnlyResult = resizeOnlyResults.find((result) => result.scenario === animatedResult.scenario);
    return resizeOnlyResult?.finalCanvasHash === animatedResult.finalCanvasHash;
  });
  const recommendation = {
    path:
      animatedMeetsTarget && animatedMatchesResizeOnly
        ? 'animated-option-final-option'
        : 'resize-only-final-option',
    activeStepTargetMs: ACTIVE_STEP_TARGET_MS,
    animatedMeetsTarget,
    animatedMatchesResizeOnly,
  };

  const rawResult = {
    generatedAt: new Date().toISOString(),
    browserVersion: await browser.version(),
    echartsVersion: await page.evaluate(() => window.echarts.version),
    resize: { steps: 60, start: { width: 400, height: 300 }, end: { width: 800, height: 500 } },
    scenarios,
    paths,
    recommendation,
    results,
  };
  writeFileSync(rawResultPath, `${JSON.stringify(rawResult, null, 2)}\n`);

  const fixed = (value) => value.toFixed(1).padStart(8);
  console.log('\n# Force resize benchmark (ms)\n');
  for (const scenario of scenarios) {
    console.log(`## ${scenario.name}`);
    for (const result of results.filter((entry) => entry.scenario === scenario.name)) {
      const bounds = result.validation.nodeBounds;
      console.log(
        `  ${result.path.padEnd(28)} p50 ${fixed(result.syncStepMs.p50)}  ` +
          `p95 ${fixed(result.syncStepMs.p95)}  max ${fixed(result.syncStepMs.maximum)}  ` +
          `total ${fixed(result.totalSettleMs)}  calls ${result.setOptionCount}/${result.resizeCount}  ` +
          `bounds ${bounds.allInside ? 'inside' : `${bounds.outsideCount} outside`}  ` +
          `hash ${result.finalCanvasHash.slice(0, 12)}`
      );
    }
    console.log('');
  }

  console.log(
    `Measured recommendation: ${recommendation.path} ` +
      `(animated max <= ${ACTIVE_STEP_TARGET_MS} ms: ${animatedMeetsTarget}; ` +
      `final hashes match resize-only: ${animatedMatchesResizeOnly})`
  );
  console.log('Final canvases:');
  for (const result of results) {
    console.log(`  ${result.scenario}, ${result.path}: ${result.finalCanvasPath}`);
  }
  console.log(`Raw results: ${rawResultPath}`);
} finally {
  await browser.close();
}
