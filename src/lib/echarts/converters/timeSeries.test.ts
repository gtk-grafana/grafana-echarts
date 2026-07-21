import {
  createTheme,
  type DataFrame,
  FieldType,
  getDefaultTimeRange,
  toDataFrame,
  type ValueFormatter,
} from '@grafana/data';
import { type LineSeriesOption } from 'echarts/types/src/chart/line/LineSeries';
import { seriesTypePath } from 'editor/constants';
import { type CartesianSingleValueSeriesType } from 'editor/types';
import { type ChartContext } from 'lib/echarts/charts/types';
import { timeSeriesToEChartsOption } from 'lib/echarts/converters/timeSeries';
import { LARGE_MODE_THRESHOLD, SYMBOL_VISIBLE_MAX_POINTS } from 'lib/echarts/options/performance';
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

/** Columnar source of a dataset entry, typed for assertions. */
const source = (result: NonNullable<ReturnType<typeof run>>, datasetIndex: number): Record<string, unknown[]> =>
  result.dataset[datasetIndex].source as Record<string, unknown[]>;

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
    it('returns one series per numeric field, all reading one shared columnar dataset', () => {
      const result = run([wideFrame()], 'line')!;

      expect(result.series).toHaveLength(2);
      // One dataset for the frame; both series read from it via distinct value dims.
      expect(result.dataset).toHaveLength(1);
      expect(result.series[0]).toMatchObject({
        name: 'cpu',
        type: 'line',
        datasetIndex: 0,
        encode: { x: 'time', y: 'v1' },
      });
      expect(result.series[1]).toMatchObject({
        name: 'mem',
        type: 'line',
        datasetIndex: 0,
        encode: { x: 'time', y: 'v2' },
      });
      // Columnar source, not inline row tuples.
      expect(source(result, 0)).toMatchObject({ time: [1, 2, 3], v1: [10, 20, 30], v2: [40, 50, 60] });
    });

    it('references the DataFrame columns directly (zero-copy, no per-point tuples)', () => {
      const frame = wideFrame();
      const result = run([frame], 'line')!;

      // No `[time, value]` tuples are allocated: series carry encode/datasetIndex, not data.
      expect(result.series[0]).not.toHaveProperty('data');
      // The dataset columns are the very same arrays held by the frame's fields.
      expect(source(result, 0).time).toBe(frame.fields[0].values);
      expect(source(result, 0).v1).toBe(frame.fields[1].values);
      expect(source(result, 0).v2).toBe(frame.fields[2].values);
    });

    it('resolves a color for each series, shared between symbol and line', () => {
      const result = run([wideFrame()], 'line')!;

      const series = result.series[0] as LineSeriesOption;
      expect(series.itemStyle?.color).toEqual('#808080');
    });
  });

  describe('Multi format (many frames, each with its own time field)', () => {
    it('returns one dataset and series per frame, preserving each frame non-aligned timestamps', () => {
      const frames = [multiFrame('a', [1, 2, 3], [10, 20, 30]), multiFrame('b', [5, 6, 9], [60, 80, 90])];

      const result = run(frames, 'line')!;

      expect(result.series).toHaveLength(2);
      expect(result.dataset).toHaveLength(2);

      // Each series reads its own frame's dataset (distinct datasetIndex).
      expect(result.series[0]).toMatchObject({ name: 'a', datasetIndex: 0, encode: { x: 'time', y: 'v1' } });
      expect(source(result, 0)).toMatchObject({ time: [1, 2, 3], v1: [10, 20, 30] });

      // Second series keeps its own distinct, non-aligned timestamps in its dataset.
      expect(result.series[1]).toMatchObject({ name: 'b', datasetIndex: 1, encode: { x: 'time', y: 'v1' } });
      expect(source(result, 1)).toMatchObject({ time: [5, 6, 9], v1: [60, 80, 90] });
    });
  });

  describe('value coercion', () => {
    it('passes value columns through by reference; ECharts renders null/undefined holes as gaps, keeps zero', () => {
      const frame = multiFrame('a', [1, 2, 3, 4], [0, null, 30, undefined as unknown as number]);

      const result = run([frame], 'line')!;

      // Zero-copy: the value column is the frame's own array (no coercion pass).
      expect(source(result, 0).v1).toBe(frame.fields[1].values);
      // Zero is preserved (not turned into a gap); the hole stays nullish.
      expect(source(result, 0).v1[0]).toBe(0);
      expect(source(result, 0).v1[1]).toBeNull();
    });
  });

  describe('series type', () => {
    it.each(['line', 'bar', 'scatter', 'effectScatter'] as CartesianSingleValueSeriesType[])(
      'propagates the requested series type "%s" to every series',
      (seriesType) => {
        const result = run([wideFrame()], seriesType)!;

        expect(result.series.every((series) => series.type === seriesType)).toBe(true);
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

      const result = run([frame], 'line')!;

      // Overridden field becomes a bar; the other keeps the panel default line.
      expect(result.series[0]).toMatchObject({ name: 'requests', type: 'bar' });
      expect(result.series[1]).toMatchObject({ name: 'latency', type: 'line' });
    });

    it('ignores a non-cartesian override and falls back to the default', () => {
      const frame = toDataFrame({
        fields: [
          { name: 'time', type: FieldType.time, values: [1, 2] },
          { name: 'cpu', type: FieldType.number, values: [10, 20], config: { custom: { seriesType: 'pie' } } },
        ],
      });

      const result = run([frame], 'line')!;

      expect(result.series[0].type).toBe('line');
    });
  });

  describe('stacking', () => {
    it('adds a shared stack group to bar series when the panel default is on', () => {
      const result = run([wideFrame()], 'bar', { stackSeries: true })!;

      expect(result.series.every((series) => (series as LineSeriesOption).stack === 'total')).toBe(true);
    });

    it('does not stack when the panel default is off', () => {
      const result = run([wideFrame()], 'bar', { stackSeries: false })!;

      expect(result.series.every((series) => (series as LineSeriesOption).stack === undefined)).toBe(true);
    });

    it('never stacks non-bar series even when stacking is on', () => {
      const result = run([wideFrame()], 'line', { stackSeries: true })!;

      expect(result.series.every((series) => (series as LineSeriesOption).stack === undefined)).toBe(true);
    });

    it('lets a per-field stackSeries override win over the panel default', () => {
      const frame = toDataFrame({
        fields: [
          { name: 'time', type: FieldType.time, values: [1, 2] },
          { name: 'stacked', type: FieldType.number, values: [10, 20], config: { custom: { stackSeries: true } } },
          { name: 'unstacked', type: FieldType.number, values: [1, 2], config: { custom: { stackSeries: false } } },
        ],
      });

      const result = run([frame], 'bar', { stackSeries: false })!;

      expect(result.series[0]).toMatchObject({ name: 'stacked', stack: 'total' });
      expect((result.series[1] as LineSeriesOption).stack).toBeUndefined();
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
      const result = run([frame], 'line', { stackSeries: true })!;

      expect(result.series[0]).toMatchObject({ name: 'asBar', type: 'bar', stack: 'total' });
      expect(result.series[1]).toMatchObject({ name: 'asLine', type: 'line' });
      expect((result.series[1] as LineSeriesOption).stack).toBeUndefined();
    });
  });

  describe('performance fast-path props', () => {
    it('keeps symbols and no sampling on a sparse line series (below the density threshold)', () => {
      const result = run([densityFrame(SYMBOL_VISIBLE_MAX_POINTS)], 'line')!;

      expect(result.series[0]).toMatchObject({ showSymbol: true });
      expect((result.series[0] as LineSeriesOption).sampling).toBeUndefined();
    });

    it('drops symbols and enables LTTB on a dense line series', () => {
      const result = run([densityFrame(SYMBOL_VISIBLE_MAX_POINTS + 1)], 'line')!;

      expect(result.series[0]).toMatchObject({ showSymbol: false, sampling: 'lttb' });
    });

    it('honors the Show points = Never override on a sparse series', () => {
      const result = run([densityFrame(10)], 'line', { performance: { showPoints: 'never' } })!;

      expect(result.series[0]).toMatchObject({ showSymbol: false });
    });

    it('honors the Downsampling = off override on a dense series', () => {
      const result = run([densityFrame(SYMBOL_VISIBLE_MAX_POINTS + 1)], 'line', {
        performance: { downsampling: false },
      })!;

      expect((result.series[0] as LineSeriesOption).sampling).toBeUndefined();
    });

    it('enables large mode on a dense scatter series', () => {
      const result = run([densityFrame(LARGE_MODE_THRESHOLD)], 'scatter')!;

      expect(result.series[0]).toMatchObject({ large: true, largeThreshold: LARGE_MODE_THRESHOLD });
    });

    it('leaves a sparse scatter series untouched by large mode', () => {
      const result = run([densityFrame(10)], 'scatter')!;

      expect(result.series[0]).not.toHaveProperty('large');
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

      const result = run([invalid, valid], 'line')!;
      expect(result.series[0].name).toBe('a');
      expect(result.dataset).toHaveLength(1);
    });
  });
});
