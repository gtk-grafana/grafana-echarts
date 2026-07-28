import { type DataFrame, FieldType, toDataFrame } from '@grafana/data';
import { render } from '@testing-library/react';
import { normalizeCanvasEvents, SERIES_ZLEVEL } from 'test/canvas';
import { getCanvasEvents, getComponent, height, width } from 'test/panel';

// Only the symbol threshold is mocked, so the lever can be crossed with a handful
// of points. Rendering a real 100+ point chart would commit a snapshot of
// hundreds of draw calls to assert one boolean, and would silently rewrite itself
// if the production threshold ever moved. Mocking pins the *behavior* at the
// boundary rather than the constant's current value.
//
// LTTB carries no threshold of ours, but it cannot disturb these snapshots
// either: ECharts only samples a series with ~1.5x more points than the axis has
// pixels, far past these sizes (see `lib/echarts/performance/constants.ts`), so
// they stay about symbols alone.
//
// This is what `lib/echarts/performance/constants.ts` exists for as a separate
// module: it can be mocked without touching the resolvers that read it.
jest.mock('lib/echarts/performance/constants', () => ({
  ...jest.requireActual('lib/echarts/performance/constants'),
  SYMBOL_VISIBLE_MAX_TOTAL_POINTS: 3,
}));

/** Mocked value of `SYMBOL_VISIBLE_MAX_TOTAL_POINTS` — a chart *total*, not per-series. */
const MOCKED_MAX_TOTAL_POINTS = 3;

/** A time frame with `series` numeric fields of `points` rows each, one hour apart. */
const densityFrame = (points: number, series = 1): DataFrame =>
  toDataFrame({
    fields: [
      {
        name: 'time',
        type: FieldType.time,
        values: Array.from({ length: points }, (_, i) => 1783137094497 + i * 3600000),
      },
      ...Array.from({ length: series }, (_, s) => ({
        name: `cpu${s}`,
        type: FieldType.number,
        values: Array.from({ length: points }, (_, i) => 10 + ((i + s) % 5) * 10),
        config: { displayName: `cpu${s}` },
      })),
    ],
  });

const renderSeriesLayer = async (points: number, series = 1, panelOptions = {}) => {
  const { container } = render(
    getComponent([densityFrame(points, series)], 'line', {
      zLevel: { series: SERIES_ZLEVEL },
      animation: { enabled: false },
      ...panelOptions,
    })
  );
  const { defaultEvents, seriesEvents } = await getCanvasEvents(container);
  return { defaultEvents, seriesEvents };
};

// Canvas integration tests for the density-driven symbol lever
// (`SYMBOL_VISIBLE_MAX_TOTAL_POINTS` -> ECharts `series.showSymbol`). The series
// layer is snapshotted; the grid/axis layer is viewer-only context. See
// `docs/performance.md`.
describe('Panel canvas performance fast path', () => {
  // At the threshold, every point still draws its marker: the line path plus one
  // arc per point.
  it('draws point markers at the symbol threshold', async () => {
    const { defaultEvents, seriesEvents } = await renderSeriesLayer(MOCKED_MAX_TOTAL_POINTS);

    expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
  });

  // One point past it the markers are gone, leaving only the line path. This is
  // the regression guard: if the resolver stops honoring the threshold, markers
  // reappear here and the snapshot moves.
  it('drops point markers one point past the symbol threshold', async () => {
    const { defaultEvents, seriesEvents } = await renderSeriesLayer(MOCKED_MAX_TOTAL_POINTS + 1);

    expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
  });

  // The threshold is a chart *total*, not per-series: two 2-point series draw 4
  // markers and must lose them, even though no single series is past the
  // threshold. This is the case a per-series threshold got wrong — 1000 series x
  // 100 points measured 720ms with markers on versus 54ms with them off.
  it('drops point markers when the chart total crosses the threshold across several short series', async () => {
    const { defaultEvents, seriesEvents } = await renderSeriesLayer(2, 2);

    expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
  });

  // Same shape, one point fewer in total: still under the threshold, so markers
  // stay. Pins the boundary from the other side so the test above cannot pass
  // merely because multi-series charts never draw markers.
  it('keeps point markers when several short series stay under the total', async () => {
    const { defaultEvents, seriesEvents } = await renderSeriesLayer(1, 3);

    expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
  });

  // `Show points: Always` overrides the density decision, so the dense series
  // that lost its markers above gets them back.
  it('keeps point markers past the threshold when Show points is Always', async () => {
    const { defaultEvents, seriesEvents } = await renderSeriesLayer(MOCKED_MAX_TOTAL_POINTS + 1, 1, {
      performance: { showPoints: 'always' },
    });

    expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
  });
});

/**
 * Draw calls that put ink on the series layer. A line series paints via `lineTo`
 * (path segments) and `arc` (point markers) — a series with neither renders as an
 * empty canvas, however many `moveTo`/`stroke` pairs it emits, because a
 * zero-length path covers no pixels.
 */
const countInk = (events: Array<{ type: string }>) =>
  events.reduce(
    (acc, { type }) => ({
      arc: acc.arc + (type === 'arc' ? 1 : 0),
      lineTo: acc.lineTo + (type === 'lineTo' ? 1 : 0),
    }),
    { arc: 0, lineTo: 0 }
  );

// Guards the blank-panel regression: hiding markers on a series that draws no
// line leaves nothing on the canvas at all. Asserted by counting ink rather than
// snapshotting, because "did anything render" is the whole claim — a snapshot
// would state it in a thousand lines and still pass if it were re-recorded blank.
// Core Grafana keeps these points visible too, via its uPlot `pointsFilter`.
describe('Panel canvas performance fast path: series that draw no line', () => {
  // Several one-point frames (a Prometheus instant query): past the total, but no
  // series has two points to draw a line between.
  it('still paints single-point series past the symbol threshold', async () => {
    const frames = Array.from({ length: MOCKED_MAX_TOTAL_POINTS + 1 }, (_, i) =>
      toDataFrame({
        fields: [
          { name: 'time', type: FieldType.time, values: [1783137094497 + i * 3600000] },
          { name: `cpu${i}`, type: FieldType.number, values: [10 + i * 10], config: { displayName: `cpu${i}` } },
        ],
      })
    );

    const { container } = render(
      getComponent(frames, 'line', { zLevel: { series: SERIES_ZLEVEL }, animation: { enabled: false } })
    );
    const { seriesEvents } = await getCanvasEvents(container);

    expect(countInk(seriesEvents).arc).toBeGreaterThan(0);
  });

  // One series past the threshold whose values are each separated by nulls, so
  // `connectNulls: false` leaves no drawable segment anywhere.
  it('still paints a series whose every value is null-separated', async () => {
    const points = (MOCKED_MAX_TOTAL_POINTS + 1) * 2;
    const frame = toDataFrame({
      fields: [
        {
          name: 'time',
          type: FieldType.time,
          values: Array.from({ length: points }, (_, i) => 1783137094497 + i * 3600000),
        },
        {
          name: 'cpu',
          type: FieldType.number,
          values: Array.from({ length: points }, (_, i) => (i % 2 === 0 ? 10 + (i % 5) * 10 : null)),
          config: { displayName: 'cpu' },
        },
      ],
    });

    const { container } = render(
      getComponent([frame], 'line', { zLevel: { series: SERIES_ZLEVEL }, animation: { enabled: false } })
    );
    const { seriesEvents } = await getCanvasEvents(container);

    const ink = countInk(seriesEvents);
    expect(ink.lineTo).toBe(0); // nulls break every segment: markers are all there is
    expect(ink.arc).toBeGreaterThan(0);
  });

  // The other side of the boundary: an ordinary dense series does lose its
  // markers, so the guard above cannot be passing because symbols never drop.
  it('still drops markers on an ordinary dense series', async () => {
    const { seriesEvents } = await renderSeriesLayer(MOCKED_MAX_TOTAL_POINTS + 1);

    const ink = countInk(seriesEvents);
    expect(ink.arc).toBe(0);
    expect(ink.lineTo).toBeGreaterThan(0); // the line is what renders it instead
  });
});
