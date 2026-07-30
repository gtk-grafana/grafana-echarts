import {
  createDataFrame,
  DataFrameType,
  FieldType,
  getPanelDataSummary,
  VisualizationSuggestionScore,
} from '@grafana/data';
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
  it('scores OK for a multi-layer time series', () => {
    const result = streamSuggestionsSupplier(getPanelDataSummary([wideFrame(3)]));

    // Caps at OK on purpose: a river trades the value axis for composition, so it
    // is an alternative to the cartesian suggestion, not a rival.
    expect(result).toHaveLength(1);
    expect(result![0].score).toBe(VisualizationSuggestionScore.OK);
  });

  it('scores OK for a one-frame-per-series response', () => {
    const result = streamSuggestionsSupplier(getPanelDataSummary([wideFrame(1), wideFrame(1)]));

    expect(result).toHaveLength(1);
  });

  it('scores OK for a long frame, whose label column pivots into layers', () => {
    expect(streamSuggestionsSupplier(getPanelDataSummary([longFrame()]))).toHaveLength(1);
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

  it('withholds for an empty response', () => {
    expect(streamSuggestionsSupplier(getPanelDataSummary([]))).toBeUndefined();
  });
});
