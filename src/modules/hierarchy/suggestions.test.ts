import {
  createDataFrame,
  DataFrameType,
  FieldType,
  getPanelDataSummary,
  VisualizationSuggestionScore,
} from '@grafana/data';
import { hierarchySuggestionsSupplier } from './suggestions';

describe('hierarchySuggestionsSupplier', () => {
  it('returns void when there is no numeric field', () => {
    const result = hierarchySuggestionsSupplier(
      getPanelDataSummary([
        createDataFrame({ fields: [{ name: 'label', type: FieldType.string, values: ['a', 'b'] }] }),
      ])
    );
    expect(result).toBeUndefined();
  });

  it('returns void for multi-point (non-instant, non-numeric) time series', () => {
    const result = hierarchySuggestionsSupplier(
      getPanelDataSummary([
        createDataFrame({
          fields: [
            { name: 'time', type: FieldType.time, values: [0, 100, 200] },
            { name: 'value', type: FieldType.number, values: [1, 2, 3] },
          ],
        }),
      ])
    );
    expect(result).toBeUndefined();
  });

  it('suggests treemap and sunburst variants scored Good for numeric frame types', () => {
    const result = hierarchySuggestionsSupplier(
      getPanelDataSummary([
        createDataFrame({
          meta: { type: DataFrameType.NumericWide },
          fields: [
            { name: 'a', type: FieldType.number, values: [1] },
            { name: 'b', type: FieldType.number, values: [2] },
          ],
        }),
      ])
    );
    expect(result).toHaveLength(2);
    expect(result!.map((suggestion) => suggestion.name)).toEqual(['Treemap', 'Sunburst']);
    expect(result!.every((suggestion) => suggestion.score === VisualizationSuggestionScore.Good)).toBe(true);
    expect(result!.map((suggestion) => suggestion.options?.seriesType)).toEqual(['treemap', 'sunburst']);
  });

  it('scores OK for instant numeric data without a dataplane type', () => {
    const result = hierarchySuggestionsSupplier(
      getPanelDataSummary([
        createDataFrame({
          fields: [
            { name: 'time', type: FieldType.time, values: [100] },
            { name: 'value', type: FieldType.number, values: [42] },
          ],
        }),
      ])
    );
    expect(result!.every((suggestion) => suggestion.score === VisualizationSuggestionScore.OK)).toBe(true);
  });
});
