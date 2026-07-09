import {
  createTheme,
  dateTime,
  type DataFrame,
  FieldType,
  type TimeRange,
  toDataFrame,
  type ValueFormatter,
} from '@grafana/data';
import { seriesTypePath } from 'editor/constants';
import { type MultiValueSeriesType } from 'editor/types';
import { type ChartContext } from 'lib/echarts/charts/types';
import { multiValueCartesianToEChartsOption } from 'lib/echarts/converters/multiValueCartesian';
import { type PanelOptions } from 'types';

const theme = createTheme();

const formatValue: ValueFormatter = (value) => ({ text: value == null ? '' : String(value) });

/** Absolute time range from epoch-ms bounds, matching what the panel passes in. */
const timeRange = (from: number, to: number): TimeRange => ({
  from: dateTime(from),
  to: dateTime(to),
  raw: { from: dateTime(from), to: dateTime(to) },
});

// Wide default range that covers every fixture row (candlestick rows sit at
// t=0 and t=60_000), so a test only narrows it when it asserts range filtering.
const fullRange = timeRange(0, 60_000);

/** Build a minimal ChartContext for the multi-value converter under test. */
const makeContext = (
  frames: DataFrame[],
  seriesType: MultiValueSeriesType,
  range: TimeRange = fullRange
): ChartContext<MultiValueSeriesType> => ({
  frames,
  theme,
  timeZone: 'utc',
  timeRange: range,
  options: { [seriesTypePath]: seriesType } as PanelOptions,
  seriesType,
  formatValue,
});

/** Run the converter, normalizing the ECharts `Arrayable` series into an array. */
const run = (frames: DataFrame[], seriesType: MultiValueSeriesType, range?: TimeRange) => {
  const result = multiValueCartesianToEChartsOption(makeContext(frames, seriesType, range));
  if (result === null) {
    return null;
  }

  const { categories, series } = result;
  if (!Array.isArray(series)) {
    throw new Error('Narrow series to array');
  }

  return { categories, series };
};

const ohlcFrame = (fieldNames = ['open', 'high', 'low', 'close']): DataFrame =>
  toDataFrame({
    name: 'BTC',
    fields: [
      { name: 'time', type: FieldType.time, values: [0, 60_000] },
      { name: fieldNames[0], type: FieldType.number, values: [10, 15] },
      { name: fieldNames[1], type: FieldType.number, values: [20, 25] },
      { name: fieldNames[2], type: FieldType.number, values: [5, 12] },
      { name: fieldNames[3], type: FieldType.number, values: [18, 22] },
    ],
  });

describe('multiValueCartesianToEChartsOption', () => {
  describe('candlestick', () => {
    it('maps OHLC fields to ECharts [open, close, low, high] order', () => {
      const result = run([ohlcFrame()], 'candlestick');

      expect(result).not.toBeNull();
      expect(result!.series).toHaveLength(1);
      expect(result!.series[0]).toMatchObject({
        name: 'BTC',
        type: 'candlestick',
        data: [
          [10, 18, 5, 20],
          [15, 22, 12, 25],
        ],
      });
    });

    it('labels each item by its timestamp (ISO), one per row', () => {
      const result = run([ohlcFrame()], 'candlestick');

      expect(result!.categories).toEqual([new Date(0).toISOString(), new Date(60_000).toISOString()]);
    });

    it('resolves OHLC fields case-insensitively', () => {
      const result = run([ohlcFrame(['Open', 'HIGH', 'Low', 'Close'])], 'candlestick');

      expect(result!.series[0].data).toEqual([
        [10, 18, 5, 20],
        [15, 22, 12, 25],
      ]);
    });

    it('resolves a color for the series', () => {
      const result = run([ohlcFrame()], 'candlestick');

      expect(result!.series[0].itemStyle?.color).toEqual(expect.any(String));
    });

    it('preserves zero but maps null/undefined to gaps', () => {
      const frame = toDataFrame({
        fields: [
          { name: 'time', type: FieldType.time, values: [0] },
          { name: 'open', type: FieldType.number, values: [0] },
          { name: 'high', type: FieldType.number, values: [null] },
          { name: 'low', type: FieldType.number, values: [undefined as unknown as number] },
          { name: 'close', type: FieldType.number, values: [3] },
        ],
      });

      const result = run([frame], 'candlestick');

      expect(result!.series[0].data).toEqual([[0, 3, null, null]]);
    });

    it('drops rows outside the dashboard time range when a time field is present', () => {
      const result = run([ohlcFrame()], 'candlestick', timeRange(0, 30_000));

      // Rows are at t=0 and t=60_000; only the first is within [0, 30_000].
      expect(result!.categories).toEqual([new Date(0).toISOString()]);
      expect(result!.series[0].data).toEqual([[10, 18, 5, 20]]);
    });

    it('keeps every row when the time range covers all rows', () => {
      const result = run([ohlcFrame()], 'candlestick', timeRange(0, 60_000));

      expect(result!.series[0].data).toHaveLength(2);
    });

    it('returns null when an OHLC field is missing', () => {
      const frame = toDataFrame({
        fields: [
          { name: 'time', type: FieldType.time, values: [0] },
          { name: 'open', type: FieldType.number, values: [10] },
          { name: 'high', type: FieldType.number, values: [20] },
          { name: 'low', type: FieldType.number, values: [5] },
        ],
      });

      expect(run([frame], 'candlestick')).toBeNull();
    });

    it('places the series on the configured zlevel', () => {
      const ctx = makeContext([ohlcFrame()], 'candlestick');
      const result = multiValueCartesianToEChartsOption({
        ...ctx,
        options: { ...ctx.options, zLevel: { series: 3 } },
      });
      const series = result!.series;
      if (!Array.isArray(series)) {
        throw new Error('Narrow series to array');
      }

      expect(series[0].zlevel).toBe(3);
    });
  });

  describe('boxplot', () => {
    const boxFrame = (fieldNames = ['min', 'q1', 'median', 'q3', 'max']): DataFrame =>
      toDataFrame({
        name: 'latency',
        fields: [
          { name: 'category', type: FieldType.string, values: ['a', 'b'] },
          { name: fieldNames[0], type: FieldType.number, values: [1, 2] },
          { name: fieldNames[1], type: FieldType.number, values: [3, 4] },
          { name: fieldNames[2], type: FieldType.number, values: [5, 6] },
          { name: fieldNames[3], type: FieldType.number, values: [7, 8] },
          { name: fieldNames[4], type: FieldType.number, values: [9, 10] },
        ],
      });

    it('maps named fields to [min, Q1, median, Q3, max] over a category axis', () => {
      const result = run([boxFrame()], 'boxplot');

      expect(result!.categories).toEqual(['a', 'b']);
      expect(result!.series[0]).toMatchObject({
        name: 'latency',
        type: 'boxplot',
        data: [
          [1, 3, 5, 7, 9],
          [2, 4, 6, 8, 10],
        ],
      });
    });

    it('falls back to the first five numeric fields when names do not match', () => {
      const result = run([boxFrame(['a', 'b', 'c', 'd', 'e'])], 'boxplot');

      expect(result!.series[0].data).toEqual([
        [1, 3, 5, 7, 9],
        [2, 4, 6, 8, 10],
      ]);
    });

    it('ignores the time range for a categorical (non-time) frame', () => {
      const result = run([boxFrame()], 'boxplot', timeRange(0, 1));

      expect(result!.categories).toEqual(['a', 'b']);
      expect(result!.series[0].data).toHaveLength(2);
    });

    it('returns null with fewer than five numeric fields', () => {
      const frame = toDataFrame({
        fields: [
          { name: 'category', type: FieldType.string, values: ['a'] },
          { name: 'min', type: FieldType.number, values: [1] },
          { name: 'q1', type: FieldType.number, values: [3] },
          { name: 'median', type: FieldType.number, values: [5] },
          { name: 'q3', type: FieldType.number, values: [7] },
        ],
      });

      expect(run([frame], 'boxplot')).toBeNull();
    });
  });

  it('returns null when no frame has a numeric field', () => {
    const frame = toDataFrame({
      fields: [{ name: 'category', type: FieldType.string, values: ['a', 'b'] }],
    });

    expect(run([frame], 'candlestick')).toBeNull();
  });
});
