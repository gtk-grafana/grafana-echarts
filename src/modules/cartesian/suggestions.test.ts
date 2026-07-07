import {
  createDataFrame,
  DataFrameType,
  FieldType,
  getPanelDataSummary,
  VisualizationSuggestionScore,
} from '@grafana/data';
import { cartesianSuggestionsSupplier } from './suggestions';

const timeSeriesFrame = (type?: DataFrameType) =>
  createDataFrame({
    ...(type ? { meta: { type } } : {}),
    fields: [
      { name: 'time', type: FieldType.time, values: [0, 100, 200] },
      { name: 'value', type: FieldType.number, values: [1, 2, 3] },
    ],
  });

describe('cartesianSuggestionsSupplier', () => {
  it('returns void when there is no time field', () => {
    const result = cartesianSuggestionsSupplier(
      getPanelDataSummary([createDataFrame({ fields: [{ name: 'value', type: FieldType.number, values: [1, 2, 3] }] })])
    );
    expect(result).toBeUndefined();
  });

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
