import { FieldType, VisualizationSuggestionScore, VisualizationSuggestionsSupplier } from '@grafana/data';
import { EChartsFieldConfig } from 'editor/types';
import { PanelOptions } from 'types';

// Visualization Suggestions for the multivariate family: radar built
// from multiple numeric metrics per entity (categories -> indicators).
// https://grafana.com/developers/plugin-tools/how-to-guides/panel-plugins/add-suggestions-support
export const multivariateSuggestionsSupplier: VisualizationSuggestionsSupplier<PanelOptions, EChartsFieldConfig> = (
  dataSummary
) => {
  // Radar only makes sense with several metrics to place around the axes.
  if (dataSummary.fieldCountByType(FieldType.number) < 2) {
    return;
  }

  return [{ score: VisualizationSuggestionScore.OK }];
};
