import { DataFrameType, FieldColorModeId, FieldType, ThresholdsMode, toDataFrame } from '@grafana/data';
import { act, fireEvent, screen } from '@testing-library/react';
import { GRAPH_EDGES_WIDE } from 'lib/echarts/converters/graphWide';
import {
  clearMockedCanvasEvents,
  DEFAULT_LAYER_SELECTOR,
  getChart,
  normalizeCanvasEvents,
  readCanvasLayer,
  SERIES_LAYER_SELECTOR,
} from 'test/canvas';
import { height, waitForFinished, width } from 'test/panel';
import { renderRelations } from 'test/relationsCanvas';

// The one picture the time slider is worth committing: the graph read at a **selected**
// timestamp, drawn in the box the strip left it.
//
// Both facts are visible in the same baseline. The plot is 32px shorter than every other
// relations baseline (`TIME_SLIDER_HEIGHT` — the strip takes layout rather than overlaying),
// and the edge labels read `1`/`10` — the earliest row — where `lastNotNull` would print
// `3`/`30`. Both are also stated as comparisons in
// `relations-timeline.integration.test.tsx`; this is what they look like.
//
// Edge values are on deliberately: a graph link's thickness comes from `custom.lineWidth`,
// not from its weight, so without the labels the two timestamps would paint identical lines.

const T0 = 1700000000000;
const STEP = 300000;

/** One ranged edges frame on a shared row grid — the pivoted Prometheus shape. */
const rangedEdges = () =>
  toDataFrame({
    name: 'edges',
    meta: { type: GRAPH_EDGES_WIDE },
    fields: [
      { name: 'Time', type: FieldType.time, values: [T0, T0 + STEP, T0 + 2 * STEP] },
      { name: 'gateway-->api', type: FieldType.number, values: [1, 2, 3] },
      { name: 'api-->db', type: FieldType.number, values: [10, 20, 30] },
    ],
  });

/**
 * The nodes half of the same response, as a **service graph really returns it**: an
 * instant query, which answers `numeric-multi` and still ships a `Time` column — one row,
 * stamped with the evaluation instant rather than with a step on the edges' grid.
 *
 * Graded, because the bug this pins cost the node its colour as well as its value. See
 * `isTimelessFrame`.
 */
const instantNodes = () =>
  toDataFrame({
    name: 'nodes',
    meta: { type: DataFrameType.NumericMulti },
    fields: [
      { name: 'Time', type: FieldType.time, values: [T0 + 7] },
      graded('gateway', 10),
      graded('api', 90),
      graded('db', 50),
    ],
  });

/** Green under 40, orange from 40, red from 70 — one band per node in the fixture. */
const steps = {
  mode: ThresholdsMode.Absolute,
  steps: [
    { value: -Infinity, color: 'green' },
    { value: 40, color: 'orange' },
    { value: 70, color: 'red' },
  ],
};

function graded(name: string, value: number) {
  return {
    name,
    type: FieldType.number,
    values: [value],
    config: { color: { mode: FieldColorModeId.Thresholds }, thresholds: steps },
  };
}

/**
 * Scrub to the earliest stop and return the layers, repainted clean.
 *
 * `jest-canvas-mock` accumulates draw calls and never resets on `clearRect`, so by the
 * time the scrub settles the layers hold the newest-row paint *and* the scrubbed one.
 * Both are discarded and one clean repaint is forced at the chart's **own** size — not
 * `width`/`height`, which would resize the plot back over the strip and undo what these
 * baselines pin.
 */
const scrubToEarliest = async (container: HTMLElement) => {
  const { chartInstanceDom, chart } = getChart(container);

  // `Home` takes rc-slider to its minimum, which is the earliest stop. `fireEvent`
  // act-wraps itself; only the settling is awaited inside `act`, which is what keeps
  // React's own post-commit microtask inside the scope too.
  fireEvent.keyDown(screen.getByRole('slider', { name: 'Selected time' }), { key: 'Home', keyCode: 36 });
  await act(async () => {
    await waitForFinished(chart);
  });

  chartInstanceDom.querySelectorAll('canvas').forEach((canvas) => {
    const ctx = canvas.getContext('2d');
    if (ctx) {
      clearMockedCanvasEvents(ctx);
    }
  });
  chart?.resize({ width: chart.getWidth(), height: chart.getHeight() });
  chart?.getZr().flush();

  return {
    seriesEvents: readCanvasLayer(chartInstanceDom, SERIES_LAYER_SELECTOR),
    defaultEvents: readCanvasLayer(chartInstanceDom, DEFAULT_LAYER_SELECTOR),
  };
};

describe('relations time slider', () => {
  it('the graph at the earliest timestamp, under the slider strip (edge weights 1 and 10)', async () => {
    const { container } = await renderRelations({
      frames: [rangedEdges()],
      options: { relationsTimeSlider: true, relationsShowEdgeValues: true },
    });

    const { seriesEvents, defaultEvents } = await scrubToEarliest(container);

    expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
  });

  /**
   * **The reported bug.** A mixed response — ranged edges beside an instant nodes query —
   * lost every node the moment the slider was switched on: `rowAt` found no row at the
   * selected stop, because the instant frame's one `Time` value is the evaluation instant
   * and lands nowhere near the edges' grid, so every node read `null`.
   *
   * `null` is not only a missing tooltip row, which is why this is a picture rather than a
   * unit assertion. It costs the node its **colour**: a by-value scheme has no value to
   * grade, `colorOf` returns nothing, and `fillPaletteColors` hands the node a palette slot
   * instead. So the baseline pins both halves at once — `10` / `90` / `50` drawn under the
   * nodes, in green / red / orange, at a stop the instant frame never carried.
   *
   * The edges move with the slider in the same picture (`1` and `10`, not `3` and `30`),
   * which is the point: one frame is read at a timestamp and the other whole.
   */
  it('a graded instant nodes frame at the earliest stop (values and bands kept, edges still scrubbed)', async () => {
    const { container } = await renderRelations({
      frames: [rangedEdges(), instantNodes()],
      options: { relationsTimeSlider: true, relationsShowEdgeValues: true, relationsShowNodeValues: true },
    });

    const { seriesEvents, defaultEvents } = await scrubToEarliest(container);

    expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
  });
});
