import { type VisualizationSuggestionsSupplier } from '@grafana/data';
import { seriesTypePath } from 'editor/constants';
import { type EChartsFieldConfig } from 'editor/types';
import { scoreHierarchy } from 'lib/echarts/charts/fitness';
import { previewCardOptions } from 'lib/echarts/charts/suggestionCards';
import { type PanelOptions } from 'types';

// Visualization Suggestions for the hierarchy family (treemap/sunburst).
//
// Flame-graph nested-set frames are the ideal fit and are now detected outright:
// `PanelDataSummary` carries `hasPreferredVisualisationType` (Grafana's canonical
// signal for a flame graph) and `rawFrames`, so `isFlameGraphFrame` can be applied
// as the fallback for provisioned TestData CSV, which cannot set frame metadata.
// Everything else falls back to the flat categorical path (one value per category),
// which is the same gate part-to-whole uses — hence delegating to `scoreHierarchy`
// rather than restating it here, as this supplier used to.
// https://grafana.com/developers/plugin-tools/how-to-guides/panel-plugins/add-suggestions-support
export const hierarchySuggestionsSupplier: VisualizationSuggestionsSupplier<PanelOptions, EChartsFieldConfig> = (
  dataSummary
) => {
  const score = scoreHierarchy(dataSummary);
  if (score == null) {
    return;
  }

  const cardOptions = previewCardOptions();
  return [
    { name: 'Treemap', score, options: { [seriesTypePath]: 'treemap' }, cardOptions },
    { name: 'Sunburst', score, options: { [seriesTypePath]: 'sunburst' }, cardOptions },
  ];
};
