import {
  createTheme,
  type DataFrame,
  FieldType,
  getDefaultTimeRange,
  toDataFrame,
  type ValueFormatter,
} from '@grafana/data';
import { type LineSeriesOption } from 'echarts';
import { seriesTypePath } from 'editor/constants';
import { type CartesianSingleValueSeriesType } from 'editor/types';
import { type ChartContext } from 'lib/echarts/charts/types';
import { timeSeriesToEChartsOption } from 'lib/echarts/converters/timeSeries';
import { LARGE_MODE_THRESHOLD, SYMBOL_VISIBLE_MAX_TOTAL_POINTS } from 'lib/echarts/performance/constants';
import { type PanelOptions } from 'types';

const theme = createTheme();

const formatValue: ValueFormatter = (value) => ({ text: value == null ? '' : String(value) });

/** Build a minimal ChartContext for the time series converter under test. */
const makeContext = (
  frames: DataFrame[],
  seriesType: CartesianSingleValueSeriesType,
  options?: Partial<PanelOptions>
): ChartContext<CartesianSingleValueSeriesType> => ({
  frames,
  theme,
  timeZone: 'utc',
  timeRange: getDefaultTimeRange(),
  options: { [seriesTypePath]: seriesType, ...options } as PanelOptions,
  seriesType,
  formatValue,
  replaceVariables: (value: string) => value,
  fieldConfig: { defaults: {}, overrides: [] },
});

const run = (frames: DataFrame[], seriesType: CartesianSingleValueSeriesType, options?: Partial<PanelOptions>) =>
  timeSeriesToEChartsOption(makeContext(frames, seriesType, options));

/**
 * `run` for the cases that must produce series, narrowing away the converter's
 * `null` (which only the "cannot produce time series" block below exercises).
 */
const runSeries = (
  frames: DataFrame[],
  seriesType: CartesianSingleValueSeriesType,
  options?: Partial<PanelOptions>
) => {
  const result = run(frames, seriesType, options);
  if (result === null) {
    throw new Error('expected the converter to produce series');
  }
  return result;
};

const wideFrame = (): DataFrame =>
  toDataFrame({
    fields: [
      { name: 'time', type: FieldType.time, values: [1, 2, 3] },
      { name: 'cpu', type: FieldType.number, values: [10, 20, 30], config: { displayName: 'cpu' } },
      { name: 'mem', type: FieldType.number, values: [40, 50, 60], config: { displayName: 'mem' } },
    ],
  });

const multiFrame = (name: string, times: number[], values: Array<number | null>): DataFrame =>
  toDataFrame({
    fields: [
      { name: 'time', type: FieldType.time, values: times },
      { name: 'value', type: FieldType.number, values, config: { displayName: name } },
    ],
  });

/** A single-series time frame with `points` rows (for density-threshold tests). */
const densityFrame = (points: number): DataFrame =>
  toDataFrame({
    fields: [
      { name: 'time', type: FieldType.time, values: Array.from({ length: points }, (_, i) => i) },
      { name: 'value', type: FieldType.number, values: Array.from({ length: points }, (_, i) => i) },
    ],
  });

describe('timeSeriesToEChartsOption', () => {
  describe('Wide format (one frame, shared time field, many value fields)', () => {
    it('returns one series per numeric field sharing the time field', () => {
      const result = runSeries([wideFrame()], 'line');

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ name: 'cpu', type: 'line' });
      expect(Array.from(result[0].data as Float64Array)).toEqual([1, 10, 2, 20, 3, 30]);
      expect(result[1]).toMatchObject({ name: 'mem', type: 'line' });
      expect(Array.from(result[1].data as Float64Array)).toEqual([1, 40, 2, 50, 3, 60]);
    });

    // The dense-chart fast path: one flat interleaved buffer per series instead
    // of per-point [time, value] tuples (SOURCE_FORMAT_TYPED_ARRAY — see
    // docs/performance.md). `dimensions` is required with a flat buffer.
    it('emits data as an interleaved Float64Array with declared dimensions', () => {
      const result = runSeries([wideFrame()], 'line');

      expect(result[0].data).toBeInstanceOf(Float64Array);
      expect(result[0]).toMatchObject({ dimensions: ['time', 'value'] });
    });

    it('resolves a color for each series, shared between symbol and line', () => {
      const result = runSeries([wideFrame()], 'line');

      const series = result[0] as LineSeriesOption;
      expect(series.itemStyle?.color).toEqual('#808080');
    });

    // The canvas snapshot harness (src/test/canvas.ts) relies on the series layer
    // being split onto its own zlevel; keep it pinned at the converter.
    it('puts every series on the configured series zlevel', () => {
      const result = runSeries([wideFrame()], 'line', { zLevel: { series: 1 } });

      expect(result.every((series) => series.zlevel === 1)).toBe(true);
    });
  });

  describe('Multi format (many frames, each with its own time field)', () => {
    it('returns one series per frame, preserving each frame non-aligned timestamps', () => {
      const frames = [multiFrame('a', [1, 2, 3], [10, 20, 30]), multiFrame('b', [5, 6, 9], [60, 80, 90])];

      const result = runSeries(frames, 'line');

      expect(result).toHaveLength(2);

      expect(result[0].name).toBe('a');
      expect(Array.from(result[0].data as Float64Array)).toEqual([1, 10, 2, 20, 3, 30]);

      // Second series keeps its own distinct, non-aligned timestamps.
      expect(result[1].name).toBe('b');
      expect(Array.from(result[1].data as Float64Array)).toEqual([5, 60, 6, 80, 9, 90]);
    });
  });

  describe('value coercion', () => {
    // Typed-array data has no null: missing values are NaN, which ECharts treats
    // as a gap exactly like tuple-form null. Zero is preserved.
    it('coerces null/undefined values to NaN but preserves zero', () => {
      const frame = multiFrame('a', [1, 2, 3, 4], [0, null, 30, undefined as unknown as number]);

      const result = runSeries([frame], 'line');

      expect(Array.from(result[0].data as Float64Array)).toEqual([1, 0, 2, NaN, 3, 30, 4, NaN]);
    });
  });

  describe('series type', () => {
    it.each(['line', 'bar', 'scatter', 'effectScatter'] as CartesianSingleValueSeriesType[])(
      'propagates the requested series type "%s" to every series',
      (seriesType) => {
        const result = runSeries([wideFrame()], seriesType);

        expect(result.every((series) => series.type === seriesType)).toBe(true);
      }
    );
  });

  describe('per-field series type override', () => {
    it('uses a field custom.seriesType override over the panel default', () => {
      const frame = toDataFrame({
        fields: [
          { name: 'time', type: FieldType.time, values: [1, 2] },
          { name: 'requests', type: FieldType.number, values: [10, 20], config: { custom: { seriesType: 'bar' } } },
          { name: 'latency', type: FieldType.number, values: [1, 2] },
        ],
      });

      const result = runSeries([frame], 'line');

      // Overridden field becomes a bar; the other keeps the panel default line.
      expect(result[0]).toMatchObject({ name: 'requests', type: 'bar' });
      expect(result[1]).toMatchObject({ name: 'latency', type: 'line' });
    });

    it('ignores a non-cartesian override and falls back to the default', () => {
      const frame = toDataFrame({
        fields: [
          { name: 'time', type: FieldType.time, values: [1, 2] },
          { name: 'cpu', type: FieldType.number, values: [10, 20], config: { custom: { seriesType: 'pie' } } },
        ],
      });

      const result = runSeries([frame], 'line');

      expect(result[0].type).toBe('line');
    });
  });

  describe('stacking', () => {
    it('adds a shared stack group to bar series when the panel default is on', () => {
      const result = runSeries([wideFrame()], 'bar', { stackSeries: true });

      expect(result.every((series) => (series as LineSeriesOption).stack === 'total')).toBe(true);
    });

    it('does not stack when the panel default is off', () => {
      const result = runSeries([wideFrame()], 'bar', { stackSeries: false });

      expect(result.every((series) => (series as LineSeriesOption).stack === undefined)).toBe(true);
    });

    it('never stacks non-bar series even when stacking is on', () => {
      const result = runSeries([wideFrame()], 'line', { stackSeries: true });

      expect(result.every((series) => (series as LineSeriesOption).stack === undefined)).toBe(true);
    });

    it('lets a per-field stackSeries override win over the panel default', () => {
      const frame = toDataFrame({
        fields: [
          { name: 'time', type: FieldType.time, values: [1, 2] },
          { name: 'stacked', type: FieldType.number, values: [10, 20], config: { custom: { stackSeries: true } } },
          { name: 'unstacked', type: FieldType.number, values: [1, 2], config: { custom: { stackSeries: false } } },
        ],
      });

      const result = runSeries([frame], 'bar', { stackSeries: false });

      expect(result[0]).toMatchObject({ name: 'stacked', stack: 'total' });
      expect((result[1] as LineSeriesOption).stack).toBeUndefined();
    });

    it('only stacks a field whose type override renders it as bar', () => {
      const frame = toDataFrame({
        fields: [
          { name: 'time', type: FieldType.time, values: [1, 2] },
          { name: 'asBar', type: FieldType.number, values: [10, 20], config: { custom: { seriesType: 'bar' } } },
          { name: 'asLine', type: FieldType.number, values: [1, 2], config: { custom: { seriesType: 'line' } } },
        ],
      });

      // Panel default is line; only the bar-overridden field stacks.
      const result = runSeries([frame], 'line', { stackSeries: true });

      expect(result[0]).toMatchObject({ name: 'asBar', type: 'bar', stack: 'total' });
      expect(result[1]).toMatchObject({ name: 'asLine', type: 'line' });
      expect((result[1] as LineSeriesOption).stack).toBeUndefined();
    });
  });

  describe('performance fast-path props', () => {
    it('keeps symbols on a sparse line series (below the density threshold)', () => {
      const result = runSeries([densityFrame(SYMBOL_VISIBLE_MAX_TOTAL_POINTS)], 'line');

      expect(result[0]).toMatchObject({ showSymbol: true });
    });

    it('drops symbols on a dense line series', () => {
      const result = runSeries([densityFrame(SYMBOL_VISIBLE_MAX_TOTAL_POINTS + 1)], 'line');

      expect(result[0]).toMatchObject({ showSymbol: false, sampling: 'lttb' });
    });

    // LTTB carries no threshold of ours — ECharts gates it on the rendered width,
    // so it is armed on every line series unless the user turns it off.
    it('arms LTTB even on a sparse line series (ECharts gates it on pixel width)', () => {
      const result = runSeries([densityFrame(10)], 'line');

      expect(result[0]).toMatchObject({ sampling: 'lttb' });
    });

    // A series with no two adjacent non-null values draws no line, so hiding its
    // markers would render it as nothing at all.
    it('keeps symbols on a single-point series even past the total threshold', () => {
      const frames = Array.from({ length: SYMBOL_VISIBLE_MAX_TOTAL_POINTS + 1 }, (_, i) =>
        toDataFrame({
          fields: [
            { name: 'time', type: FieldType.time, values: [i] },
            { name: `s${i}`, type: FieldType.number, values: [i] },
          ],
        })
      );

      const result = runSeries(frames, 'line');

      expect(result).toHaveLength(SYMBOL_VISIBLE_MAX_TOTAL_POINTS + 1);
      expect(result.every((series) => (series as LineSeriesOption).showSymbol === true)).toBe(true);
    });

    it('honors the Show points = Never override on a sparse series', () => {
      const result = runSeries([densityFrame(10)], 'line', { performance: { showPoints: 'never' } });

      expect(result[0]).toMatchObject({ showSymbol: false });
    });

    it('honors the Downsampling = off override on a dense series', () => {
      const result = runSeries([densityFrame(SYMBOL_VISIBLE_MAX_TOTAL_POINTS + 1)], 'line', {
        performance: { downsampling: false },
      });

      expect((result[0] as LineSeriesOption).sampling).toBeUndefined();
    });

    it('enables large mode on a dense scatter series', () => {
      const result = runSeries([densityFrame(LARGE_MODE_THRESHOLD)], 'scatter');

      expect(result[0]).toMatchObject({ large: true, largeThreshold: LARGE_MODE_THRESHOLD });
    });

    it('leaves a sparse scatter series untouched by large mode', () => {
      const result = runSeries([densityFrame(10)], 'scatter');

      expect(result[0]).not.toHaveProperty('large');
    });
  });

  describe('frames that cannot produce time series', () => {
    it('returns null for an empty frame list', () => {
      expect(run([], 'line')).toBeNull();
    });

    it('returns null when no frame has a time field', () => {
      const frame = toDataFrame({
        fields: [
          { name: 'host', type: FieldType.string, values: ['a', 'b'] },
          { name: 'cpu', type: FieldType.number, values: [1, 2] },
        ],
      });

      expect(run([frame], 'line')).toBeNull();
    });

    it('returns null when a timed frame has no numeric field', () => {
      const frame = toDataFrame({
        fields: [
          { name: 'time', type: FieldType.time, values: [1, 2] },
          { name: 'host', type: FieldType.string, values: ['a', 'b'] },
        ],
      });

      expect(run([frame], 'line')).toBeNull();
    });

    it('skips frames without a time field but keeps valid ones', () => {
      const valid = multiFrame('a', [1, 2], [10, 20]);
      const invalid = toDataFrame({
        fields: [{ name: 'cpu', type: FieldType.number, values: [1, 2] }],
      });

      const result = runSeries([invalid, valid], 'line');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('a');
    });

    describe('hover emphasis', () => {
      // The tooltip marks its focused point with a `highlight` dispatch, which
      // applies this state; without it the marker would be ECharts' near-invisible
      // default. See `lib/echarts/tooltip/proximity`.
      it.each(['line', 'scatter', 'effectScatter'] as const)('scales the %s symbol on emphasis', (seriesType) => {
        const result = run([multiFrame('a', [1, 2], [10, 20])], seriesType);

        expect(result![0].emphasis).toEqual({ focus: 'none', scale: 2 });
      });

      it('leaves bars alone: they have no symbol to scale', () => {
        const result = run([multiFrame('a', [1, 2], [10, 20])], 'bar');

        expect(result![0].emphasis).toBeUndefined();
      });
    });
  });
});
