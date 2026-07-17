import { type VisualizationSuggestionsSupplier } from '@grafana/data';
import { type EChartsFieldConfig } from 'editor/types';
import { scoreHeatmap } from 'lib/echarts/charts/fitness';
import { type PanelOptions } from 'types';

// Visualization Suggestions for the heatmap family. This is where the old
// "a heatmap frame forces heatmap rendering" rule lives now: when Grafana tags a
// frame as HeatmapRows/HeatmapCells, this panel is the best fit. Fitness scoring
// is shared with the panel-level `'Auto'` resolver through `scoreHeatmap` (see
// charts/fitness.ts).
// https://grafana.com/developers/plugin-tools/how-to-guides/panel-plugins/add-suggestions-support
export const heatmapSuggestionsSupplier: VisualizationSuggestionsSupplier<PanelOptions, EChartsFieldConfig> = (
  dataSummary
) => {
  const score = scoreHeatmap(dataSummary);
  return score == null ? undefined : [{ score }];
};
