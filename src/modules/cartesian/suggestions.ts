import { type VisualizationSuggestion, type VisualizationSuggestionsSupplier } from '@grafana/data';
import { seriesTypePath } from 'editor/constants';
import { type EChartsFieldConfig, type EChartsGraphFieldConfig } from 'editor/types';
import { scoreCartesian } from 'lib/echarts/charts/fitness';
import { type PanelOptions } from 'types';

// Visualization Suggestions for the cartesian family (Groups 1-3): line/bar/
// scatter on a shared time/value grid. Fitness scoring is shared with the
// panel-level `'Auto'` resolver through `scoreCartesian` (see charts/fitness.ts),
// so a suggestion and the auto-pick stay in lockstep.
// https://grafana.com/developers/plugin-tools/how-to-guides/panel-plugins/add-suggestions-support
export const cartesianSuggestionsSupplier: VisualizationSuggestionsSupplier<PanelOptions, EChartsGraphFieldConfig> = (
  dataSummary
) => {
  const score = scoreCartesian(dataSummary);
  if (score == null) {
    return;
  }

  // Render type (line vs bar) is an in-family variant, surfaced as separate cards.
  const variants: Array<VisualizationSuggestion<PanelOptions, EChartsFieldConfig>> = [
    { name: 'Line', options: { [seriesTypePath]: 'line' } },
    { name: 'Bar', options: { [seriesTypePath]: 'bar' } },
  ];
  return variants.map((suggestion) => ({ score, ...suggestion }));
};
