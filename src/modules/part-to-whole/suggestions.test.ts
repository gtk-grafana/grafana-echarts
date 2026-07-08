import {
  createDataFrame,
  DataFrameType,
  FieldType,
  getPanelDataSummary,
  VisualizationSuggestionScore,
} from '@grafana/data';
import { partToWholeSuggestionsSupplier } from './suggestions';

describe('partToWholeSuggestionsSupplier', () => {
  it('returns void when there is no numeric field', () => {
    const result = partToWholeSuggestionsSupplier(
      getPanelDataSummary([
        createDataFrame({ fields: [{ name: 'label', type: FieldType.string, values: ['a', 'b'] }] }),
      ])
    );
    expect(result).toBeUndefined();
  });

  it('returns void for multi-point (non-instant, non-numeric) time series', () => {
    const result = partToWholeSuggestionsSupplier(
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

  it('scores Good for numeric frame types', () => {
    const result = partToWholeSuggestionsSupplier(
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
    expect(result).toHaveLength(1);
    expect(result![0].score).toBe(VisualizationSuggestionScore.Good);
  });

  it('scores OK for instant numeric data without a dataplane type', () => {
    const result = partToWholeSuggestionsSupplier(
      getPanelDataSummary([
        createDataFrame({
          fields: [
            { name: 'time', type: FieldType.time, values: [100] },
            { name: 'value', type: FieldType.number, values: [42] },
          ],
        }),
      ])
    );
    expect(result![0].score).toBe(VisualizationSuggestionScore.OK);
  });
});
