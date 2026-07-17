import { createDataFrame, FieldType } from '@grafana/data';
import { resolveAutoSeriesType, resolveSeriesType } from 'lib/echarts/charts/autoSeriesType';

const timeNumberFrame = () =>
  createDataFrame({
    fields: [
      { name: 'time', type: FieldType.time, values: [0, 100, 200] },
      { name: 'value', type: FieldType.number, values: [1, 2, 3] },
    ],
  });

const ohlcFrame = () =>
  createDataFrame({
    fields: [
      { name: 'time', type: FieldType.time, values: [0, 60_000] },
      { name: 'open', type: FieldType.number, values: [10, 12] },
      { name: 'high', type: FieldType.number, values: [15, 18] },
      { name: 'low', type: FieldType.number, values: [8, 11] },
      { name: 'close', type: FieldType.number, values: [12, 17] },
    ],
  });

const boxplotFrame = () =>
  createDataFrame({
    fields: [
      { name: 'category', type: FieldType.string, values: ['a', 'b'] },
      { name: 'min', type: FieldType.number, values: [1, 2] },
      { name: 'q1', type: FieldType.number, values: [3, 4] },
      { name: 'median', type: FieldType.number, values: [5, 6] },
      { name: 'q3', type: FieldType.number, values: [7, 8] },
      { name: 'max', type: FieldType.number, values: [9, 10] },
    ],
  });

// A string + multiple-numeric frame. The retired global resolver scored this as
// radar (>= 2 numeric fields) — the exact shape that regressed heatmap panels to
// radar. Family scoping must keep each family on its own type.
const multiNumericFrame = () =>
  createDataFrame({
    fields: [
      { name: 'entity', type: FieldType.string, values: ['a', 'b'] },
      { name: 'x', type: FieldType.number, values: [1, 2] },
      { name: 'y', type: FieldType.number, values: [3, 4] },
      { name: 'z', type: FieldType.number, values: [5, 6] },
    ],
  });

describe('resolveAutoSeriesType', () => {
  describe('cartesian family (the only one with frame ambiguity)', () => {
    it('picks line for plain time + number data', () => {
      expect(resolveAutoSeriesType('cartesian', [timeNumberFrame()])).toBe('line');
    });

    it('picks candlestick for an OHLC-shaped frame', () => {
      expect(resolveAutoSeriesType('cartesian', [ohlcFrame()])).toBe('candlestick');
    });

    it('picks boxplot for a five-number-summary frame', () => {
      expect(resolveAutoSeriesType('cartesian', [boxplotFrame()])).toBe('boxplot');
    });

    it('falls back to line for empty data', () => {
      expect(resolveAutoSeriesType('cartesian', [])).toBe('line');
    });
  });

  describe('single-render families never resolve outside their family', () => {
    it('heatmap stays heatmap even for a frame that would otherwise score radar', () => {
      expect(resolveAutoSeriesType('heatmap', [multiNumericFrame()])).toBe('heatmap');
      expect(resolveAutoSeriesType('heatmap', [])).toBe('heatmap');
    });

    it('part-to-whole stays pie', () => {
      expect(resolveAutoSeriesType('part-to-whole', [multiNumericFrame()])).toBe('pie');
      expect(resolveAutoSeriesType('part-to-whole', [])).toBe('pie');
    });

    it('multivariate stays radar', () => {
      expect(resolveAutoSeriesType('multivariate', [timeNumberFrame()])).toBe('radar');
      expect(resolveAutoSeriesType('multivariate', [])).toBe('radar');
    });

    it('hierarchy stays treemap', () => {
      expect(resolveAutoSeriesType('hierarchy', [multiNumericFrame()])).toBe('treemap');
      expect(resolveAutoSeriesType('hierarchy', [])).toBe('treemap');
    });
  });
});

describe('resolveSeriesType', () => {
  it('passes a concrete series type through unchanged (ignoring family and data)', () => {
    expect(resolveSeriesType('bar', [ohlcFrame()], 'cartesian')).toBe('bar');
    expect(resolveSeriesType('scatter', [], 'multivariate')).toBe('scatter');
  });

  it("resolves 'Auto' within the family", () => {
    expect(resolveSeriesType('Auto', [ohlcFrame()], 'cartesian')).toBe('candlestick');
    expect(resolveSeriesType('Auto', [multiNumericFrame()], 'heatmap')).toBe('heatmap');
  });

  it('resolves an unset (undefined) series type within the family', () => {
    expect(resolveSeriesType(undefined, [timeNumberFrame()], 'cartesian')).toBe('line');
    expect(resolveSeriesType(undefined, [], 'heatmap')).toBe('heatmap');
  });
});
