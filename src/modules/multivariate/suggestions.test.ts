import { createDataFrame, FieldType, getPanelDataSummary, VisualizationSuggestionScore } from '@grafana/data';
import { multivariateSuggestionsSupplier } from './suggestions';

describe('multivariateSuggestionsSupplier', () => {
  it('returns void with fewer than two numeric fields', () => {
    const result = multivariateSuggestionsSupplier(
      getPanelDataSummary([
        createDataFrame({
          fields: [
            { name: 'metric', type: FieldType.string, values: ['a', 'b'] },
            { name: 'value', type: FieldType.number, values: [1, 2] },
          ],
        }),
      ])
    );
    expect(result).toBeUndefined();
  });

  it('scores OK for multiple numeric metrics', () => {
    const result = multivariateSuggestionsSupplier(
      getPanelDataSummary([
        createDataFrame({
          fields: [
            { name: 'entity', type: FieldType.string, values: ['a', 'b'] },
            { name: 'speed', type: FieldType.number, values: [1, 2] },
            { name: 'power', type: FieldType.number, values: [3, 4] },
            { name: 'range', type: FieldType.number, values: [5, 6] },
          ],
        }),
      ])
    );
    expect(result).toHaveLength(1);
    expect(result![0].score).toBe(VisualizationSuggestionScore.OK);
  });
});
