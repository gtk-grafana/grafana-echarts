import { type VisualizationSuggestionsSupplier } from '@grafana/data';
import { seriesTypePath } from 'editor/constants';
import { type EChartsFieldConfig } from 'editor/types';
import { scoreHeatmap, scoreMatrixHeatmap } from 'lib/echarts/charts/fitness';
import { previewCardOptions } from 'lib/echarts/charts/suggestionCards';
import { type PanelOptions } from 'types';

// Visualization Suggestions for the heatmap family. This is where the old
// "a heatmap frame forces heatmap rendering" rule lives now: when Grafana tags a
// frame as HeatmapRows/HeatmapCells, this panel is the best fit — and so is an
// untagged histogram-over-time, which `scoreHeatmap` now recognises from its bucket
// field names (see charts/fitness.ts).
//
// The family's two coordinate models are mutually exclusive branches, since they
// need opposite data: `binned` draws interval cells on continuous axes and needs a
// time dimension, while `matrix` draws a category x category tile grid and needs a
// string column instead. Each branch emits at one score, so the family always
// renders as a single contiguous group in the suggestions pane.
// https://grafana.com/developers/plugin-tools/how-to-guides/panel-plugins/add-suggestions-support
export const heatmapSuggestionsSupplier: VisualizationSuggestionsSupplier<PanelOptions, EChartsFieldConfig> = (
  dataSummary
) => {
  const cardOptions = previewCardOptions();

  const binnedScore = scoreHeatmap(dataSummary);
  if (binnedScore != null) {
    return [
      {
        name: 'Heatmap (binned)',
        score: binnedScore,
        options: { [seriesTypePath]: 'heatmap', heatmapLayout: 'binned' },
        cardOptions,
      },
    ];
  }

  const matrixScore = scoreMatrixHeatmap(dataSummary);
  if (matrixScore != null) {
    return [
      {
        name: 'Heatmap (matrix)',
        score: matrixScore,
        options: { [seriesTypePath]: 'heatmap', heatmapLayout: 'matrix' },
        cardOptions,
      },
    ];
  }

  return;
};
