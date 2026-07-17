import { type VisualizationSuggestionsSupplier } from '@grafana/data';
import { type EChartsFieldConfig } from 'editor/types';
import { scorePartToWhole } from 'lib/echarts/charts/fitness';
import { type PanelOptions } from 'types';

// Visualization Suggestions for the part-to-whole family: pie built from one
// value per category. Fitness scoring is shared with the panel-level `'Auto'`
// resolver through `scorePartToWhole` (see charts/fitness.ts).
// https://grafana.com/developers/plugin-tools/how-to-guides/panel-plugins/add-suggestions-support
export const partToWholeSuggestionsSupplier: VisualizationSuggestionsSupplier<PanelOptions, EChartsFieldConfig> = (
  dataSummary
) => {
  const score = scorePartToWhole(dataSummary);
  return score == null ? undefined : [{ score }];
};
