import { FieldType, toDataFrame } from '@grafana/data';
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
// timestamp rather than at the reduced one, drawn in the box the strip left it.
//
// Both facts are visible in the same baseline. The plot is 32px shorter than every other
// relations baseline (`TIME_SLIDER_HEIGHT` — the strip takes layout rather than
// overlaying, unlike `ChartNotices` and `ChartZoomControls`), and the edge labels read
// `1`/`10` — the earliest row — where the default reducer, `lastNotNull`, would print
// `3`/`30`. Those two claims are also stated as comparisons in
// `relations-timeline.integration.test.tsx`, which is where a *relation* between two
// renders belongs; this is what it looks like.
//
// Edge values are on deliberately: a graph link's thickness comes from
// `custom.lineWidth`, not from its weight, so without the labels the two timestamps
// would paint identical lines and the baseline would prove nothing.

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

describe('relations time slider', () => {
  it('the graph at the earliest timestamp, under the slider strip (edge weights 1 and 10)', async () => {
    const { container } = await renderRelations({
      frames: [rangedEdges()],
      options: { relationsTimeSlider: true, relationsShowEdgeValues: true },
    });
    const { chartInstanceDom, chart } = getChart(container);

    // `Home` takes rc-slider to its minimum, which is the earliest stop. `fireEvent`
    // act-wraps itself; only the settling is awaited inside `act`, which is what keeps
    // React's own post-commit microtask inside the scope too.
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Selected time' }), { key: 'Home', keyCode: 36 });
    await act(async () => {
      await waitForFinished(chart);
    });

    // `jest-canvas-mock` accumulates draw calls and never resets on `clearRect`, so by
    // now the layers hold the newest-row paint *and* the scrubbed one. Discard both and
    // force one clean repaint at the chart's own size — not `width`/`height`, which
    // would resize the plot back over the strip and undo what this pins.
    chartInstanceDom.querySelectorAll('canvas').forEach((canvas) => {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        clearMockedCanvasEvents(ctx);
      }
    });
    chart?.resize({ width: chart.getWidth(), height: chart.getHeight() });
    chart?.getZr().flush();

    const seriesEvents = readCanvasLayer(chartInstanceDom, SERIES_LAYER_SELECTOR);
    const defaultEvents = readCanvasLayer(chartInstanceDom, DEFAULT_LAYER_SELECTOR);

    expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
  });
});
