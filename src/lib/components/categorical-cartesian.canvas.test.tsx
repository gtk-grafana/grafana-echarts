import { type DataFrame, FieldType, toDataFrame } from '@grafana/data';
import { render } from '@testing-library/react';
import { type CartesianSingleValueSeriesType } from 'editor/types';
import { normalizeCanvasEvents, SERIES_ZLEVEL } from 'test/canvas';
import { getCanvasEvents, getComponent, height, width } from 'test/panel';

// Canvas integration tests for per-field render overrides on a *category* x-axis.
// The editor registers `custom.seriesType` / `custom.stackSeries` for the whole
// cartesian family, but they were only read on the time-axis path, so a category
// panel silently drew every series with the panel-level type. These pin the mixed
// geometry that fix produces: bars are filled rects, lines are stroked paths, and
// scatter is one arc per point, so a series drawn with the wrong type moves the
// snapshot.
//
// `editorMode: 'advanced'` is required — in Default mode
// `applyCartesianEditorModeDefaults` resets `animation.enabled` back on and the
// draw calls stop being deterministic.

/** A value frame carrying its own category (label) column, as a separate query returns. */
const valueFrame = (
  refId: string,
  labelField: string,
  labels: string[],
  valueField: string,
  values: number[],
  custom?: Record<string, unknown>
): DataFrame =>
  toDataFrame({
    refId,
    fields: [
      { name: labelField, type: FieldType.string, values: labels },
      {
        name: valueField,
        type: FieldType.number,
        values,
        config: { displayName: valueField, ...(custom ? { custom } : {}) },
      },
    ],
  });

const CATEGORIES = ['x', 'a', 'b', 'c'];

/** The reported panel's bar query. */
const barFrame = () => valueFrame('Bar', 'label', CATEGORIES, 'value', [5, 8, 30, 20]);

/** The reported panel's overlay query, overridden to `seriesType`. */
const markerFrame = (seriesType: string) =>
  valueFrame('Marker', 'markerLabel', CATEGORIES, 'markerValue', [3, 10, 20, 30], { seriesType });

const renderSeriesLayer = async (frames: DataFrame[], seriesType: CartesianSingleValueSeriesType, options = {}) => {
  const { container } = render(
    getComponent(frames, seriesType, {
      zLevel: { series: SERIES_ZLEVEL },
      animation: { enabled: false },
      editorMode: 'advanced',
      ...options,
    })
  );
  return getCanvasEvents(container);
};

describe('categorical cartesian per-field overrides', () => {
  // The reported case: a scatter overlay from a second query over categorical
  // bars. Both frames must render — before the fix the overlay frame was dropped
  // before it could be styled.
  it('draws a scatter overlay over categorical bars', async () => {
    const { defaultEvents, seriesEvents } = await renderSeriesLayer([barFrame(), markerFrame('scatter')], 'bar');

    expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
  });

  // Same data, line overlay: the overlay's geometry changes from arcs to a
  // stroked path while the bars stay put.
  it('draws a line overlay over categorical bars', async () => {
    const { defaultEvents, seriesEvents } = await renderSeriesLayer([barFrame(), markerFrame('line')], 'bar');

    expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
  });

  // Every override type an override can select, on one shared category axis.
  it('draws bar, line, scatter and effectScatter series together', async () => {
    const frames = [
      valueFrame('Bars', 'label', CATEGORIES, 'bars', [5, 8, 30, 20]),
      valueFrame('Line', 'lineLabel', CATEGORIES, 'lineValue', [12, 16, 24, 26], { seriesType: 'line' }),
      valueFrame('Scatter', 'scatterLabel', CATEGORIES, 'scatterValue', [3, 10, 20, 30], { seriesType: 'scatter' }),
      valueFrame('Effect', 'effectLabel', CATEGORIES, 'effectValue', [18, 6, 14, 9], {
        seriesType: 'effectScatter',
      }),
    ];

    const { defaultEvents, seriesEvents } = await renderSeriesLayer(frames, 'bar');

    expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
  });

  // Per-field stacking with a field overridden off bar: the two bars stack and
  // the line is drawn from its own values, not the stack total.
  it('stacks bar fields while an overridden line field stays out of the stack', async () => {
    const frame = toDataFrame({
      fields: [
        { name: 'category', type: FieldType.string, values: CATEGORIES },
        { name: 'Q1', type: FieldType.number, values: [20, 14, 25, 11], config: { custom: { stackSeries: true } } },
        { name: 'Q2', type: FieldType.number, values: [23, 10, 30, 11], config: { custom: { stackSeries: true } } },
        {
          name: 'Target',
          type: FieldType.number,
          values: [50, 28, 60, 26],
          config: { custom: { seriesType: 'line', stackSeries: true } },
        },
      ],
    });

    const { defaultEvents, seriesEvents } = await renderSeriesLayer([frame], 'bar');

    expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
  });

  // Frames listing categories in a different order and covering a different
  // subset. The join is by label, so the overlay lands on the right ticks and the
  // categories it has no row for leave gaps.
  it('joins series by category label across frames with different orders and subsets', async () => {
    const frames = [
      barFrame(),
      valueFrame('Marker', 'markerLabel', ['c', 'b', 'd'], 'markerValue', [30, 20, 40], { seriesType: 'scatter' }),
    ];

    const { defaultEvents, seriesEvents } = await renderSeriesLayer(frames, 'bar');

    expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
  });
});

/** Symbol draw calls on the series layer — one `arc` group per rendered point. */
const countArcs = (events: Array<{ type: string }>) =>
  events.reduce((acc, { type }) => acc + (type === 'arc' ? 1 : 0), 0);

// A category a frame has no row for must draw no symbol. Asserted by counting
// symbols rather than snapshotting, because `normalizeCanvasEvents` strips the
// transforms that carry each symbol's position (bars keep absolute coords, so
// their geometry *is* in the snapshot). Comparing a full render against a gapped
// one keeps this independent of how many `arc` calls ECharts spends per symbol.
describe('categorical cartesian label join: missing cells draw no symbol', () => {
  const overlay = (labels: string[], values: number[]) => [
    barFrame(),
    valueFrame('Marker', 'markerLabel', labels, 'markerValue', values, { seriesType: 'scatter' }),
  ];

  it('draws one symbol fewer per category the overlay frame has no row for', async () => {
    // Overlay covers all four categories.
    const full = await renderSeriesLayer(overlay(CATEGORIES, [3, 10, 20, 30]), 'bar');
    // Same frame minus one category, so one symbol should disappear.
    const gapped = await renderSeriesLayer(overlay(['x', 'a', 'b'], [3, 10, 20]), 'bar');

    const fullArcs = countArcs(full.seriesEvents);
    const gappedArcs = countArcs(gapped.seriesEvents);

    expect(fullArcs).toBeGreaterThan(0);
    // Four symbols vs three, so the drop is exactly a quarter of the full count.
    expect(gappedArcs).toBe((fullArcs / 4) * 3);
  });
});
