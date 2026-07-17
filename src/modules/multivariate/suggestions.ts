import { type VisualizationSuggestionsSupplier } from '@grafana/data';
import { type EChartsFieldConfig } from 'editor/types';
import { scoreMultivariate } from 'lib/echarts/charts/fitness';
import { type PanelOptions } from 'types';

// Visualization Suggestions for the multivariate family: radar built from
// multiple numeric metrics per entity (categories -> indicators). Fitness
// scoring is shared with the panel-level `'Auto'` resolver through
// `scoreMultivariate` (see charts/fitness.ts).
// https://grafana.com/developers/plugin-tools/how-to-guides/panel-plugins/add-suggestions-support
export const multivariateSuggestionsSupplier: VisualizationSuggestionsSupplier<PanelOptions, EChartsFieldConfig> = (
  dataSummary
) => {
  const score = scoreMultivariate(dataSummary);
  return score == null ? undefined : [{ score }];
};
