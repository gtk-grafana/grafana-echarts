import { type VisualizationSuggestion, type VisualizationSuggestionsSupplier } from '@grafana/data';
import { seriesTypePath } from 'editor/constants';
import { type EChartsFieldConfig } from 'editor/types';
import { exceedsChordNodeBudget, scoreRelations } from 'lib/echarts/charts/fitness';
import { previewCardOptions } from 'lib/echarts/charts/suggestionCards';
import { type PanelOptions } from 'types';

// Chord is not suggested when its node arcs would become crowded.
// https://grafana.com/developers/plugin-tools/how-to-guides/panel-plugins/add-suggestions-support
export const relationsSuggestionsSupplier: VisualizationSuggestionsSupplier<PanelOptions, EChartsFieldConfig> = (
  dataSummary
) => {
  const score = scoreRelations(dataSummary);
  if (score == null) {
    return;
  }

  // Hide node labels in small preview cards.
  const cardOptions = previewCardOptions({ options: { relationsShowNodeLabels: false } });

  const suggestions: Array<VisualizationSuggestion<PanelOptions, EChartsFieldConfig>> = [
    { name: 'Graph', score, options: { [seriesTypePath]: 'graph' }, cardOptions },
    { name: 'Sankey', score, options: { [seriesTypePath]: 'sankey' }, cardOptions },
  ];
  if (!exceedsChordNodeBudget(dataSummary)) {
    suggestions.push({ name: 'Chord', score, options: { [seriesTypePath]: 'chord' }, cardOptions });
  }
  return suggestions;
};
