import {
  createDataFrame,
  DataFrameType,
  FieldType,
  getPanelDataSummary,
  VisualizationSuggestionScore,
} from '@grafana/data';
import { PREVIEW_MAX_ROWS, PREVIEW_MAX_SERIES, STREAM_MAX_LAYERS } from 'lib/echarts/charts/suggestionLimits';
import { streamSuggestionsSupplier } from './suggestions';

const wideFrame = (numericFields: number, rows = 3) =>
  createDataFrame({
    meta: { type: DataFrameType.TimeSeriesWide },
    fields: [
      { name: 'time', type: FieldType.time, values: Array.from({ length: rows }, (_, i) => i * 1000) },
      ...Array.from({ length: numericFields }, (_, i) => ({
        name: `value-${i}`,
        type: FieldType.number,
        values: Array.from({ length: rows }, () => i + 1),
      })),
    ],
  });

const longFrame = () =>
  createDataFrame({
    fields: [
      { name: 'time', type: FieldType.time, values: [1000, 1000, 2000, 2000] },
      { name: 'level', type: FieldType.string, values: ['error', 'warn', 'error', 'warn'] },
      { name: 'count', type: FieldType.number, values: [1, 2, 3, 4] },
    ],
  });

describe('streamSuggestionsSupplier', () => {
  it('suggests both variants for a multi-layer time series', () => {
    const result = streamSuggestionsSupplier(getPanelDataSummary([wideFrame(3)]));

    // Caps at OK on purpose: a river trades the value axis for composition, so it
    // is an alternative to the cartesian suggestion, not a rival.
    expect(result).toHaveLength(2);
    expect(result!.map((suggestion) => suggestion.name)).toEqual(['Theme river', 'Bubble']);
    expect(result!.map((suggestion) => suggestion.options?.streamChartType)).toEqual(['river', 'bubble']);
    // Both variants route on `themeRiver`; the variant is the family-local option.
    expect(result!.every((suggestion) => suggestion.options?.seriesType === 'themeRiver')).toBe(true);
    expect(result!.every((suggestion) => suggestion.score === VisualizationSuggestionScore.OK)).toBe(true);
  });

  it('suggests both variants for a one-frame-per-series response', () => {
    expect(streamSuggestionsSupplier(getPanelDataSummary([wideFrame(1), wideFrame(1)]))).toHaveLength(2);
  });

  it('suggests both variants for a long frame, whose label column pivots into layers', () => {
    expect(streamSuggestionsSupplier(getPanelDataSummary([longFrame()]))).toHaveLength(2);
  });

  it('withholds for a single-layer time series (a filled area chart, not a river)', () => {
    expect(streamSuggestionsSupplier(getPanelDataSummary([wideFrame(1)]))).toBeUndefined();
  });

  it('withholds for instant (single-timestamp) data', () => {
    const instant = createDataFrame({
      fields: [
        { name: 'time', type: FieldType.time, values: [1000, 1000] },
        { name: 'a', type: FieldType.number, values: [1, 2] },
        { name: 'b', type: FieldType.number, values: [3, 4] },
      ],
    });

    expect(streamSuggestionsSupplier(getPanelDataSummary([instant]))).toBeUndefined();
  });

  it('withholds without a time field', () => {
    const numeric = createDataFrame({
      fields: [
        { name: 'category', type: FieldType.string, values: ['a', 'b'] },
        { name: 'x', type: FieldType.number, values: [1, 2] },
        { name: 'y', type: FieldType.number, values: [3, 4] },
      ],
    });

    expect(streamSuggestionsSupplier(getPanelDataSummary([numeric]))).toBeUndefined();
  });

  it(`withholds past ${STREAM_MAX_LAYERS} layers, where ribbons can no longer be followed`, () => {
    expect(streamSuggestionsSupplier(getPanelDataSummary([wideFrame(STREAM_MAX_LAYERS)]))).toHaveLength(2);
    expect(streamSuggestionsSupplier(getPanelDataSummary([wideFrame(STREAM_MAX_LAYERS + 1)]))).toBeUndefined();
  });

  it('withholds for an empty response', () => {
    expect(streamSuggestionsSupplier(getPanelDataSummary([]))).toBeUndefined();
  });

  it('bounds every preview card', () => {
    const result = streamSuggestionsSupplier(getPanelDataSummary([wideFrame(3)]));

    expect(result!.every((suggestion) => suggestion.cardOptions?.maxSeries === PREVIEW_MAX_SERIES)).toBe(true);
    expect(result!.every((suggestion) => suggestion.cardOptions?.maxRows === PREVIEW_MAX_ROWS)).toBe(true);
  });
});
