import { type DataFrame, FieldType, toDataFrame } from '@grafana/data';
import { render } from '@testing-library/react';
import { normalizeCanvasEvents, SERIES_ZLEVEL } from 'test/canvas';
import { getCanvasEvents, getComponent, height, width } from 'test/panel';

// The density thresholds are mocked so the symbol lever can be crossed with a
// handful of points. Rendering a real 100+ point series would commit a snapshot
// of hundreds of draw calls to assert one boolean, and would silently rewrite
// itself if the production threshold ever moved. Mocking the module keeps the
// snapshot to a few points and pins the *behavior* (markers on below the
// threshold, off above it) rather than the constant's current value.
//
// This is what `lib/echarts/performance/constants.ts` exists for as a separate
// module: it can be mocked without touching the resolvers that read it.
jest.mock('lib/echarts/performance/constants', () => ({
  ...jest.requireActual('lib/echarts/performance/constants'),
  SYMBOL_VISIBLE_MAX_POINTS: 3,
}));

const MOCKED_MAX_POINTS = 3;

/** A single-series time frame with `points` rows, one hour apart. */
const densityFrame = (points: number): DataFrame =>
  toDataFrame({
    fields: [
      {
        name: 'time',
        type: FieldType.time,
        values: Array.from({ length: points }, (_, i) => 1783137094497 + i * 3600000),
      },
      {
        name: 'cpu',
        type: FieldType.number,
        values: Array.from({ length: points }, (_, i) => 10 + (i % 5) * 10),
        config: { displayName: 'cpu' },
      },
    ],
  });

const renderSeriesLayer = async (points: number, panelOptions = {}) => {
  const { container } = render(
    getComponent([densityFrame(points)], 'line', {
      zLevel: { series: SERIES_ZLEVEL },
      animation: { enabled: false },
      ...panelOptions,
    })
  );
  const { defaultEvents, seriesEvents } = await getCanvasEvents(container);
  return { defaultEvents, seriesEvents };
};

// Canvas integration tests for the density-driven symbol lever
// (`SYMBOL_VISIBLE_MAX_POINTS` -> ECharts `series.showSymbol`). The series layer
// is snapshotted; the grid/axis layer is viewer-only context. See
// `docs/performance.md`.
describe('Panel canvas performance fast path', () => {
  // At the threshold, every point still draws its marker: the line path plus one
  // arc per point.
  it('draws point markers at the symbol threshold', async () => {
    const { defaultEvents, seriesEvents } = await renderSeriesLayer(MOCKED_MAX_POINTS);

    expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
  });

  // One point past it the markers are gone, leaving only the line path. This is
  // the regression guard: if the resolver stops honoring the threshold, markers
  // reappear here and the snapshot moves.
  it('drops point markers one point past the symbol threshold', async () => {
    const { defaultEvents, seriesEvents } = await renderSeriesLayer(MOCKED_MAX_POINTS + 1);

    expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
  });

  // `Show points: Always` overrides the density decision, so the dense series
  // that lost its markers above gets them back.
  it('keeps point markers past the threshold when Show points is Always', async () => {
    const { defaultEvents, seriesEvents } = await renderSeriesLayer(MOCKED_MAX_POINTS + 1, {
      performance: { showPoints: 'always' },
    });

    expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
  });
});
