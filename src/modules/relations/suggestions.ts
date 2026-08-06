import { type VisualizationSuggestion, type VisualizationSuggestionsSupplier } from '@grafana/data';
import { seriesTypePath } from 'editor/constants';
import { type EChartsFieldConfig } from 'editor/types';
import { exceedsChordNodeBudget, scoreRelations } from 'lib/echarts/charts/fitness';
import { previewCardOptions } from 'lib/echarts/charts/suggestionCards';
import { type PanelOptions } from 'types';

// Visualization Suggestions for the relations family (graph / sankey / chord).
//
// This supplier used to be permanently silent, on the documented grounds that
// node-graph data is identified by an `id`/`source`/`target` field shape or by
// `meta.preferredVisualisationType` and `PanelDataSummary` exposed neither. It does
// expose both: `rawFrames` gives the field shape (read by `isNodeGraphFrames`,
// which requires *both* `source` and `target` so an ordinary table with a `source`
// column is not claimed) and `hasPreferredVisualisationType` gives Grafana's own
// hint. So the family is scored from the real signal now — see `scoreRelations`.
//
// All three render types consume the identical node/link model, so they are
// variants of one card set rather than separate branches. Chord is the exception:
// it gives every node an arc on one circle, so it runs out of circumference long
// before a force layout runs out of canvas, and is dropped on crowded graphs.
// https://grafana.com/developers/plugin-tools/how-to-guides/panel-plugins/add-suggestions-support
export const relationsSuggestionsSupplier: VisualizationSuggestionsSupplier<PanelOptions, EChartsFieldConfig> = (
  dataSummary
) => {
  const score = scoreRelations(dataSummary);
  if (score == null) {
    return;
  }

  // Node labels are the dominant layout cost here (one text element per node, laid
  // out against the graph) and are unreadable at card scale.
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
