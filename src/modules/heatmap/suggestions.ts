import { DataFrameType, VisualizationSuggestionScore, type VisualizationSuggestionsSupplier } from '@grafana/data';
import { type EChartsFieldConfig } from 'editor/types';
import { type PanelOptions } from 'types';

// Visualization Suggestions for the heatmap family. This is where the
// old "a heatmap frame forces heatmap rendering" rule lives now: when Grafana
// tags a frame as HeatmapRows/HeatmapCells, this panel is the best fit.
// https://grafana.com/developers/plugin-tools/how-to-guides/panel-plugins/add-suggestions-support
export const heatmapSuggestionsSupplier: VisualizationSuggestionsSupplier<PanelOptions, EChartsFieldConfig> = (
  dataSummary
) => {
  if (
    !dataSummary.hasDataFrameType(DataFrameType.HeatmapRows) &&
    !dataSummary.hasDataFrameType(DataFrameType.HeatmapCells)
  ) {
    return;
  }

  return [{ score: VisualizationSuggestionScore.Best }];
};
