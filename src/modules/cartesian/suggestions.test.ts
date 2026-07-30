import {
  createDataFrame,
  DataFrameType,
  FieldType,
  getPanelDataSummary,
  VisualizationSuggestionScore,
} from '@grafana/data';
import { CATEGORY_MAX_ROWS, PREVIEW_MAX_ROWS, PREVIEW_MAX_SERIES } from 'lib/echarts/charts/suggestionLimits';
import { cartesianSuggestionsSupplier } from './suggestions';

const timeSeriesFrame = (type?: DataFrameType) =>
  createDataFrame({
    ...(type ? { meta: { type } } : {}),
    fields: [
      { name: 'time', type: FieldType.time, values: [0, 100, 200] },
      { name: 'value', type: FieldType.number, values: [1, 2, 3] },
    ],
  });

/** A frame of numeric columns with the given names. */
const numericFrame = (...names: string[]) =>
  createDataFrame({ fields: names.map((name) => ({ name, type: FieldType.number, values: [1, 2, 3] })) });

/** A category table: one string label column plus `numericFields` value columns. */
const categoryFrame = (numericFields: number, rows: number) =>
  createDataFrame({
    fields: [
      { name: 'label', type: FieldType.string, values: Array.from({ length: rows }, (_, row) => `c${row}`) },
      ...Array.from({ length: numericFields }, (_, field) => ({
        name: `value-${field}`,
        type: FieldType.number,
        values: Array.from({ length: rows }, (_, row) => row + field),
      })),
    ],
  });

describe('cartesianSuggestionsSupplier', () => {
  it('returns void when there is no numeric field', () => {
    const result = cartesianSuggestionsSupplier(
      getPanelDataSummary([
        createDataFrame({ fields: [{ name: 'time', type: FieldType.time, values: [0, 100, 200] }] }),
      ])
    );
    expect(result).toBeUndefined();
  });

  it('returns void for a single row', () => {
    const result = cartesianSuggestionsSupplier(
      getPanelDataSummary([
        createDataFrame({
          fields: [
            { name: 'time', type: FieldType.time, values: [0] },
            { name: 'value', type: FieldType.number, values: [1] },
          ],
        }),
      ])
    );
    expect(result).toBeUndefined();
  });

  it('returns void for instant (snapshot) data', () => {
    const result = cartesianSuggestionsSupplier(
      getPanelDataSummary([
        createDataFrame({
          fields: [
            { name: 'time', type: FieldType.time, values: [100, 100, 100] },
            { name: 'value', type: FieldType.number, values: [1, 2, 3] },
          ],
        }),
      ])
    );
    expect(result).toBeUndefined();
  });

  it('returns void for a frame of only string fields', () => {
    const result = cartesianSuggestionsSupplier(
      getPanelDataSummary([
        createDataFrame({
          fields: [
            { name: 'host', type: FieldType.string, values: ['a', 'b'] },
            { name: 'region', type: FieldType.string, values: ['eu', 'us'] },
          ],
        }),
      ])
    );
    expect(result).toBeUndefined();
  });

  describe('time axis', () => {
    it('returns line and bar variants for time + number data', () => {
      const result = cartesianSuggestionsSupplier(getPanelDataSummary([timeSeriesFrame()]));
      expect(result).toHaveLength(2);
      expect(result!.map((s) => s.name)).toEqual(['Line', 'Bar']);
      expect(result!.map((s) => s.options?.seriesType)).toEqual(['line', 'bar']);
    });

    it('scores OK for untyped time + number data', () => {
      const result = cartesianSuggestionsSupplier(getPanelDataSummary([timeSeriesFrame()]));
      expect(result!.every((s) => s.score === VisualizationSuggestionScore.OK)).toBe(true);
    });

    it('scores Good for explicit time series frame types', () => {
      const result = cartesianSuggestionsSupplier(getPanelDataSummary([timeSeriesFrame(DataFrameType.TimeSeriesWide)]));
      expect(result!.every((s) => s.score === VisualizationSuggestionScore.Good)).toBe(true);
    });
  });

  describe('multi-value frames', () => {
    it('returns exactly one Candlestick card at Best for OHLC field names', () => {
      const result = cartesianSuggestionsSupplier(getPanelDataSummary([numericFrame('open', 'high', 'low', 'close')]));

      expect(result).toHaveLength(1);
      expect(result![0].name).toBe('Candlestick');
      expect(result![0].score).toBe(VisualizationSuggestionScore.Best);
      expect(result![0].options?.seriesType).toBe('candlestick');
    });

    it('returns exactly one Box plot card at Best for a five-number summary', () => {
      const result = cartesianSuggestionsSupplier(
        getPanelDataSummary([numericFrame('min', 'q1', 'median', 'q3', 'max')])
      );

      expect(result).toHaveLength(1);
      expect(result![0].name).toBe('Box plot');
      expect(result![0].score).toBe(VisualizationSuggestionScore.Best);
      expect(result![0].options?.seriesType).toBe('boxplot');
    });

    it('takes precedence over the time-axis branch for an OHLC time series', () => {
      const ohlcOverTime = createDataFrame({
        meta: { type: DataFrameType.TimeSeriesWide },
        fields: [
          { name: 'time', type: FieldType.time, values: [0, 100, 200] },
          { name: 'open', type: FieldType.number, values: [1, 2, 3] },
          { name: 'high', type: FieldType.number, values: [2, 3, 4] },
          { name: 'low', type: FieldType.number, values: [0, 1, 2] },
          { name: 'close', type: FieldType.number, values: [1.5, 2.5, 3.5] },
        ],
      });
      const result = cartesianSuggestionsSupplier(getPanelDataSummary([ohlcOverTime]));

      expect(result).toHaveLength(1);
      expect(result![0].name).toBe('Candlestick');
    });

    // The guarantee that keeps four arbitrary metric columns out of a candlestick.
    it('never suggests candlestick for arbitrary numeric columns', () => {
      const result = cartesianSuggestionsSupplier(
        getPanelDataSummary([
          createDataFrame({
            meta: { type: DataFrameType.TimeSeriesWide },
            fields: [
              { name: 'time', type: FieldType.time, values: [0, 100, 200] },
              { name: 'a', type: FieldType.number, values: [1, 2, 3] },
              { name: 'b', type: FieldType.number, values: [2, 3, 4] },
              { name: 'c', type: FieldType.number, values: [0, 1, 2] },
              { name: 'd', type: FieldType.number, values: [3, 4, 5] },
            ],
          }),
        ])
      );

      expect(result!.map((s) => s.name)).toEqual(['Line', 'Bar']);
    });
  });

  describe('category axis', () => {
    it('returns bar, stacked bar and scatter variants for a label + value table', () => {
      const result = cartesianSuggestionsSupplier(getPanelDataSummary([categoryFrame(2, 5)]));

      expect(result).toHaveLength(3);
      expect(result!.map((s) => s.name)).toEqual(['Bar', 'Bar stacked', 'Scatter']);
      expect(result!.map((s) => s.options?.seriesType)).toEqual(['bar', 'bar', 'scatter']);
      expect(result!.map((s) => s.options?.stackSeries)).toEqual([undefined, true, undefined]);
      expect(result!.every((s) => s.score === VisualizationSuggestionScore.Good)).toBe(true);
    });

    it(`returns void past ${CATEGORY_MAX_ROWS} rows when there is a single numeric field`, () => {
      expect(cartesianSuggestionsSupplier(getPanelDataSummary([categoryFrame(1, CATEGORY_MAX_ROWS)]))).toHaveLength(3);
      expect(
        cartesianSuggestionsSupplier(getPanelDataSummary([categoryFrame(1, CATEGORY_MAX_ROWS + 1)]))
      ).toBeUndefined();
    });
  });

  describe('numeric axis', () => {
    it('returns a single Scatter card for two unlabelled numeric columns', () => {
      const result = cartesianSuggestionsSupplier(getPanelDataSummary([numericFrame('x', 'y')]));

      expect(result).toHaveLength(1);
      expect(result![0].name).toBe('Scatter');
      expect(result![0].options?.seriesType).toBe('scatter');
    });

    // Past the category row ceiling the labelled branch withdraws, but a value axis
    // is not row-bounded, so the scatter reading still applies.
    it('falls through to scatter for a wide category table past the row ceiling', () => {
      const result = cartesianSuggestionsSupplier(getPanelDataSummary([categoryFrame(2, CATEGORY_MAX_ROWS + 1)]));

      expect(result!.map((s) => s.name)).toEqual(['Scatter']);
    });
  });

  it('bounds every preview card', () => {
    const summaries = [
      getPanelDataSummary([timeSeriesFrame()]),
      getPanelDataSummary([numericFrame('open', 'high', 'low', 'close')]),
      getPanelDataSummary([categoryFrame(2, 5)]),
      getPanelDataSummary([numericFrame('x', 'y')]),
    ];

    for (const summary of summaries) {
      const result = cartesianSuggestionsSupplier(summary);
      expect(result!.every((s) => s.cardOptions?.maxSeries === PREVIEW_MAX_SERIES)).toBe(true);
      expect(result!.every((s) => s.cardOptions?.maxRows === PREVIEW_MAX_ROWS)).toBe(true);
    }
  });
});
