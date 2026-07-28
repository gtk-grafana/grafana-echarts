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
// `SAMPLING_MIN_POINTS_PER_SERIES` is deliberately left real (100), so sampling
// never engages at these sizes and these snapshots stay about symbols alone.
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
