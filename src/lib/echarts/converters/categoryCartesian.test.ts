import {
  createTheme,
  type DataFrame,
  FieldType,
  getDefaultTimeRange,
  toDataFrame,
  type ValueFormatter,
} from '@grafana/data';
import { seriesTypePath } from 'editor/constants';
import { type CartesianSingleValueSeriesType } from 'editor/types';
import { type ChartContext } from 'lib/echarts/charts/types';
import { categoryCartesianToEChartsOption } from 'lib/echarts/converters/categoryCartesian';
import { LARGE_MODE_THRESHOLD, SYMBOL_VISIBLE_MAX_TOTAL_POINTS } from 'lib/echarts/performance/constants';
import { type PanelOptions } from 'types';

const theme = createTheme();

const formatValue: ValueFormatter = (value) => ({ text: value == null ? '' : String(value) });

/** Build a minimal ChartContext for the category cartesian converter under test. */
const makeContext = (
  frames: DataFrame[],
  seriesType: CartesianSingleValueSeriesType,
  stackSeries?: boolean,
  extraOptions?: Partial<PanelOptions>
): ChartContext<CartesianSingleValueSeriesType> => ({
  frames,
  theme,
  timeZone: 'utc',
  timeRange: getDefaultTimeRange(),
  options: { [seriesTypePath]: seriesType, stackSeries, ...extraOptions } as PanelOptions,
  seriesType,
  formatValue,
  replaceVariables: (value: string) => value,
  fieldConfig: { defaults: {}, overrides: [] },
});

/** Run the converter, normalizing the ECharts `Arrayable` series into an array. */
const run = (
  frames: DataFrame[],
  seriesType: CartesianSingleValueSeriesType,
  stackSeries?: boolean,
  extraOptions?: Partial<PanelOptions>
) => {
  const { categories, series } = categoryCartesianToEChartsOption(
    makeContext(frames, seriesType, stackSeries, extraOptions)
  );
  expect(Array.isArray(series)).toBe(true);

  if (!Array.isArray(series)) {
    throw new Error('Narrow series to array');
  }

  return { categories, series };
};

const tableFrame = (): DataFrame =>
  toDataFrame({
    fields: [
      { name: 'category', type: FieldType.string, values: ['Sales', 'Admin', 'IT'] },
      { name: 'Budget', type: FieldType.number, values: [43, 10, 30], config: { displayName: 'Budget' } },
      { name: 'Actual', type: FieldType.number, values: [50, 14, 28], config: { displayName: 'Actual' } },
    ],
  });

describe('categoryCartesianToEChartsOption', () => {
  it('projects each numeric field onto the shared category axis', () => {
    const result = run([tableFrame()], 'bar');

    expect(result.categories).toEqual(['Sales', 'Admin', 'IT']);
    expect(result.series).toMatchObject([
      { name: 'Budget', type: 'bar', data: [43, 10, 30] },
      { name: 'Actual', type: 'bar', data: [50, 14, 28] },
    ]);
  });

  it('applies the panel-level series type to every series without overrides', () => {
    const result = run([tableFrame()], 'line');

    expect(result.series).toMatchObject([{ type: 'line' }, { type: 'line' }]);
  });

  it('resolves a color on itemStyle for each bar series', () => {
    const result = run([tableFrame()], 'bar');

    // Bars render from itemStyle; they carry no lineStyle.
    for (const s of result.series) {
      expect(s.itemStyle?.color).toEqual('#808080');
    }
  });

  it('colors line series on both itemStyle and lineStyle', () => {
    const result = run([tableFrame()], 'line');

    for (const s of result.series) {
      expect(s).toMatchObject({ itemStyle: { color: '#808080' }, lineStyle: { color: '#808080' } });
    }
  });

  it('falls back to row indices when there is no string field', () => {
    const frame = toDataFrame({
      fields: [{ name: 'v', type: FieldType.number, values: [1, 2], config: { displayName: 'v' } }],
    });

    const result = run([frame], 'bar');

    expect(result.categories).toEqual(['0', '1']);
  });

  // The editor registers `custom.seriesType` / `custom.stackSeries` for the whole
  // cartesian family, so the category axis honors them exactly as the time axis
  // does. Before this was wired the controls were visible here but inert.
  describe('per-field series type override', () => {
    /** A category frame whose `Actual` field carries a series-type override. */
    const overrideFrame = (seriesType: string): DataFrame =>
      toDataFrame({
        fields: [
          { name: 'category', type: FieldType.string, values: ['Sales', 'Admin', 'IT'] },
          { name: 'Budget', type: FieldType.number, values: [43, 10, 30], config: { displayName: 'Budget' } },
          {
            name: 'Actual',
            type: FieldType.number,
            values: [50, 14, 28],
            config: { displayName: 'Actual', custom: { seriesType } },
          },
        ],
      });

    it('draws an overridden field with its own type while others keep the panel default', () => {
      const result = run([overrideFrame('scatter')], 'bar');

      expect(result.series).toMatchObject([
        { name: 'Budget', type: 'bar' },
        { name: 'Actual', type: 'scatter' },
      ]);
    });

    it.each(['line', 'scatter', 'effectScatter'])('honors a %s override on a bar panel', (seriesType) => {
      const result = run([overrideFrame(seriesType)], 'bar');

      expect(result.series[1]).toMatchObject({ name: 'Actual', type: seriesType });
    });

    // The per-field picker offers candlestick/boxplot, but those build one series
    // from several fields so no single series can render them; they must fall back
    // rather than emit an invalid series type.
    it.each(['candlestick', 'boxplot', 'pie', 'Auto'])(
      'ignores the non-single-value %s override and keeps the panel type',
      (seriesType) => {
        const result = run([overrideFrame(seriesType)], 'bar');

        expect(result.series[1]).toMatchObject({ name: 'Actual', type: 'bar' });
      }
    );

    // A scatter overlay carries no line, so it must not inherit the line branch's
    // LTTB sampling — the perf lever follows the resolved type, not the panel's.
    it('resolves fast-path props from the overridden type, not the panel type', () => {
      const rows = SYMBOL_VISIBLE_MAX_TOTAL_POINTS + 1;
      const frame = toDataFrame({
        fields: [
          { name: 'category', type: FieldType.string, values: Array.from({ length: rows }, (_, i) => `c${i}`) },
          { name: 'asLine', type: FieldType.number, values: Array.from({ length: rows }, (_, i) => i) },
          {
            name: 'asScatter',
            type: FieldType.number,
            values: Array.from({ length: rows }, (_, i) => i),
            config: { custom: { seriesType: 'scatter' } },
          },
        ],
      });

      const { series } = run([frame], 'line');

      // Line branch: symbols dropped above the total threshold, LTTB armed.
      expect(series[0]).toMatchObject({ type: 'line', showSymbol: false, sampling: 'lttb' });
      // Scatter branch: `large` is its lever; it never gets showSymbol/sampling.
      expect(series[1]).toMatchObject({ type: 'scatter' });
      expect(series[1]).not.toHaveProperty('sampling');
      expect(series[1]).not.toHaveProperty('showSymbol');
    });
  });

  describe('per-field stack override', () => {
    const stackFrame = (custom: Record<string, unknown>): DataFrame =>
      toDataFrame({
        fields: [
          { name: 'category', type: FieldType.string, values: ['a', 'b'] },
          { name: 'plain', type: FieldType.number, values: [1, 2], config: { displayName: 'plain' } },
          {
            name: 'overridden',
            type: FieldType.number,
            values: [3, 4],
            config: { displayName: 'overridden', custom },
          },
        ],
      });

    it('stacks a field whose override opts in while the panel default is off', () => {
      const { series } = run([stackFrame({ stackSeries: true })], 'bar', false);

      expect(series[0]).not.toHaveProperty('stack');
      expect(series[1]).toHaveProperty('stack', 'total');
    });

    it('opts a field out of stacking when the panel default is on', () => {
      const { series } = run([stackFrame({ stackSeries: false })], 'bar', true);

      expect(series[0]).toHaveProperty('stack', 'total');
      expect(series[1]).not.toHaveProperty('stack');
    });

    // Stacking follows the resolved render type, so a field overridden away from
    // bar must not stack even with the panel flag on.
    it('never stacks a field overridden to a non-bar type', () => {
      const { series } = run([stackFrame({ seriesType: 'line', stackSeries: true })], 'bar', true);

      expect(series[0]).toHaveProperty('stack', 'total');
      expect(series[1]).toMatchObject({ type: 'line' });
      expect(series[1]).not.toHaveProperty('stack');
    });
  });

  describe('stacking', () => {
    it('adds a shared stack group to bar series when stacking is on', () => {
      const result = run([tableFrame()], 'bar', true);

      for (const s of result.series) {
        expect(s).toHaveProperty('stack', 'total');
      }
    });

    it('does not stack bar series when stacking is off', () => {
      const result = run([tableFrame()], 'bar', false);
      const resultStacked = run([tableFrame()], 'bar', true);

      expect(result.series.length).toEqual(resultStacked.series.length);
      for (let i = 0; i < result.series.length; i++) {
        expect(result.series[i]).not.toHaveProperty('stack');
        expect(resultStacked.series[i]).toHaveProperty('stack', 'total');
      }
    });

    it.each(['line', 'scatter'])('never stacks %s series even when stacking is on', (seriesType) => {
      const result = run([tableFrame()], seriesType as CartesianSingleValueSeriesType, true);

      for (const s of result.series) {
        // Asserting something doesn't exist is typically a bad test smell, but paired with the test above I think it's fine to verify that we're not stacking things that should not be stacked
        // Although eCharts does support setting stack on scatter and line, I think those usages are for when scatter/line shares a stack group with a bar chart which is probably fine to set aside for now
        expect(s).not.toHaveProperty('stack');
      }
    });
  });

  // The Advanced Performance options are registered for the whole cartesian
  // family, so the category-axis path resolves the same levers as the time-axis
  // one. Before this was wired the controls were visible here but inert.
  describe('performance fast-path props', () => {
    /** A category frame with `series` numeric fields of `rows` values each. */
    const densityFrame = (rows: number, series = 1): DataFrame =>
      toDataFrame({
        fields: [
          {
            name: 'category',
            type: FieldType.string,
            values: Array.from({ length: rows }, (_, i) => `c${i}`),
          },
          ...Array.from({ length: series }, (_, s) => ({
            name: `v${s}`,
            type: FieldType.number,
            values: Array.from({ length: rows }, (_, i) => i + s),
            config: { displayName: `v${s}` },
          })),
        ],
      });

    it('keeps symbols on a sparse category line chart', () => {
      const { series } = run([densityFrame(SYMBOL_VISIBLE_MAX_TOTAL_POINTS)], 'line');

      expect(series[0]).toMatchObject({ showSymbol: true });
    });

    it('drops symbols once the category chart total crosses the threshold', () => {
      const { series } = run([densityFrame(SYMBOL_VISIBLE_MAX_TOTAL_POINTS + 1)], 'line');

      expect(series[0]).toMatchObject({ showSymbol: false });
    });

    // Same total-not-per-series rule as the time axis: two short series still add
    // up to more markers than the chart should draw.
    it('measures the total across every category series, not the longest', () => {
      const rows = Math.ceil((SYMBOL_VISIBLE_MAX_TOTAL_POINTS + 1) / 2);
      const { series } = run([densityFrame(rows, 2)], 'line');

      expect(series.every((s) => 'showSymbol' in s && s.showSymbol === false)).toBe(true);
    });

    it('honors the Show points = Always override', () => {
      const { series } = run([densityFrame(SYMBOL_VISIBLE_MAX_TOTAL_POINTS + 1)], 'line', undefined, {
        performance: { showPoints: 'always' },
      });

      expect(series[0]).toMatchObject({ showSymbol: true });
    });

    it('enables large mode on a dense category bar chart', () => {
      const { series } = run([densityFrame(LARGE_MODE_THRESHOLD)], 'bar');

      expect(series[0]).toMatchObject({ large: true, largeThreshold: LARGE_MODE_THRESHOLD });
    });

    it('leaves a sparse category bar chart untouched', () => {
      const { series } = run([densityFrame(10)], 'bar');

      expect(series[0]).not.toHaveProperty('large');
    });
  });

  // Contract A from todo/multiple-frames.md: one frame per series, categories
  // unioned by label. This is what a scatter-overlay-from-a-second-query panel
  // needs; before it, every frame after the first was silently dropped.
  describe('multiple value frames', () => {
    const barFrame = (): DataFrame =>
      toDataFrame({
        refId: 'Bar',
        fields: [
          { name: 'label', type: FieldType.string, values: ['x', 'a', 'b', 'c'] },
          { name: 'value', type: FieldType.number, values: [5, 8, 30, 20], config: { displayName: 'value' } },
        ],
      });

    const markerFrame = (): DataFrame =>
      toDataFrame({
        refId: 'Marker',
        fields: [
          { name: 'markerLabel', type: FieldType.string, values: ['x', 'a', 'b', 'c'] },
          {
            name: 'markerValue',
            type: FieldType.number,
            values: [3, 10, 20, 30],
            config: { displayName: 'markerValue', custom: { seriesType: 'scatter' } },
          },
        ],
      });

    it('emits a series per frame instead of dropping all but the first', () => {
      const result = run([barFrame(), markerFrame()], 'bar');

      expect(result.categories).toEqual(['x', 'a', 'b', 'c']);
      expect(result.series).toMatchObject([
        { name: 'value', type: 'bar', data: [5, 8, 30, 20] },
        { name: 'markerValue', type: 'scatter', data: [3, 10, 20, 30] },
      ]);
    });

    it('joins by label rather than row position when frames order categories differently', () => {
      const reordered = toDataFrame({
        refId: 'Marker',
        fields: [
          // Same labels as the bar frame, reversed.
          { name: 'markerLabel', type: FieldType.string, values: ['c', 'b', 'a', 'x'] },
          { name: 'markerValue', type: FieldType.number, values: [30, 20, 10, 3] },
        ],
      });

      const result = run([barFrame(), reordered], 'bar');

      expect(result.categories).toEqual(['x', 'a', 'b', 'c']);
      // Values follow the labels, so the overlay still lines up with its bars.
      expect(result.series[1]).toMatchObject({ data: [3, 10, 20, 30] });
    });

    it('unions categories in first-appearance order and nulls the missing cells', () => {
      const partial = toDataFrame({
        refId: 'Marker',
        fields: [
          { name: 'markerLabel', type: FieldType.string, values: ['b', 'd'] },
          { name: 'markerValue', type: FieldType.number, values: [20, 40] },
        ],
      });

      const result = run([barFrame(), partial], 'bar');

      // 'd' is new, so it lands after the first frame's labels.
      expect(result.categories).toEqual(['x', 'a', 'b', 'c', 'd']);
      // The bar frame has no 'd' row, the marker frame only has 'b' and 'd'.
      expect(result.series[0]).toMatchObject({ data: [5, 8, 30, 20, null] });
      expect(result.series[1]).toMatchObject({ data: [null, null, 20, null, 40] });
    });

    it('collapses duplicate labels within a frame to the first row', () => {
      const dupes = toDataFrame({
        refId: 'Marker',
        fields: [
          { name: 'markerLabel', type: FieldType.string, values: ['a', 'a'] },
          { name: 'markerValue', type: FieldType.number, values: [11, 99] },
        ],
      });

      const result = run([barFrame(), dupes], 'bar');

      expect(result.categories).toEqual(['x', 'a', 'b', 'c']);
      expect(result.series[1]).toMatchObject({ data: [null, 11, null, null] });
    });

    // Duplicate x labels are legal on a single-frame category axis (ECharts draws
    // repeated ticks), so the single-frame path must not dedupe them.
    it('preserves duplicate labels when only one frame carries values', () => {
      const dupes = toDataFrame({
        fields: [
          { name: 'label', type: FieldType.string, values: ['a', 'a', 'b'] },
          { name: 'value', type: FieldType.number, values: [1, 2, 3] },
        ],
      });

      const result = run([dupes], 'bar');

      expect(result.categories).toEqual(['a', 'a', 'b']);
      expect(result.series[0]).toMatchObject({ data: [1, 2, 3] });
    });

    it('ignores frames that carry no numeric field', () => {
      const labelsOnly = toDataFrame({
        fields: [{ name: 'label', type: FieldType.string, values: ['zz'] }],
      });

      const result = run([barFrame(), labelsOnly], 'bar');

      expect(result.categories).toEqual(['x', 'a', 'b', 'c']);
      expect(result.series).toHaveLength(1);
    });

    it('measures density across every frame, not just the first', () => {
      const rows = Math.ceil((SYMBOL_VISIBLE_MAX_TOTAL_POINTS + 1) / 2);
      const half = (refId: string): DataFrame =>
        toDataFrame({
          refId,
          fields: [
            { name: 'label', type: FieldType.string, values: Array.from({ length: rows }, (_, i) => `c${i}`) },
            { name: refId, type: FieldType.number, values: Array.from({ length: rows }, (_, i) => i) },
          ],
        });

      const { series } = run([half('A'), half('B')], 'line');

      expect(series.every((s) => 'showSymbol' in s && s.showSymbol === false)).toBe(true);
    });
  });

  it('keeps the category axis with no series when every series is hidden', () => {
    // Hiding all series strips the numeric value fields, leaving only the
    // category (string) field. The axis should still render its labels.
    const frame = toDataFrame({
      fields: [{ name: 'category', type: FieldType.string, values: ['a', 'b'] }],
    });

    const result = run([frame], 'bar');

    expect(result.categories).toEqual(['a', 'b']);
    expect(result.series).toEqual([]);
  });
});
