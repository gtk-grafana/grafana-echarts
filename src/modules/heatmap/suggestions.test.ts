import {
  createDataFrame,
  DataFrameType,
  FieldType,
  getPanelDataSummary,
  VisualizationSuggestionScore,
} from '@grafana/data';
import { heatmapSuggestionsSupplier } from './suggestions';

describe('heatmapSuggestionsSupplier', () => {
  it('returns void when no heatmap frame type is present', () => {
    const result = heatmapSuggestionsSupplier(
      getPanelDataSummary([
        createDataFrame({
          meta: { type: DataFrameType.TimeSeriesWide },
          fields: [
            { name: 'time', type: FieldType.time, values: [0, 100] },
            { name: 'value', type: FieldType.number, values: [1, 2] },
          ],
        }),
      ])
    );
    expect(result).toBeUndefined();
  });

  it('scores Best for HeatmapRows frames', () => {
    const result = heatmapSuggestionsSupplier(
      getPanelDataSummary([
        createDataFrame({
          meta: { type: DataFrameType.HeatmapRows },
          fields: [
            { name: 'xMax', type: FieldType.time, values: [0, 100] },
            { name: '1', type: FieldType.number, values: [1, 2] },
          ],
        }),
      ])
    );
    expect(result).toHaveLength(1);
    expect(result![0].score).toBe(VisualizationSuggestionScore.Best);
  });

  it('scores Best for HeatmapCells frames', () => {
    const result = heatmapSuggestionsSupplier(
      getPanelDataSummary([
        createDataFrame({
          meta: { type: DataFrameType.HeatmapCells },
          fields: [
            { name: 'xMin', type: FieldType.number, values: [0, 1] },
            { name: 'yMin', type: FieldType.number, values: [0, 1] },
            { name: 'count', type: FieldType.number, values: [1, 2] },
          ],
        }),
      ])
    );
    expect(result![0].score).toBe(VisualizationSuggestionScore.Best);
  });
});
