import { type VisualizationSuggestionsSupplier } from '@grafana/data';
import { type EChartsFieldConfig } from 'editor/types';
import { scoreStream } from 'lib/echarts/charts/fitness';
import { type PanelOptions } from 'types';

// Visualization Suggestions for the stream family: a theme river over time-series
// data with more than one layer (numeric fields, one frame per series, or a label
// column to pivot on). Fitness scoring is shared with the panel-level `'Auto'`
// resolver through `scoreStream` (see charts/fitness.ts).
// https://grafana.com/developers/plugin-tools/how-to-guides/panel-plugins/add-suggestions-support
export const streamSuggestionsSupplier: VisualizationSuggestionsSupplier<PanelOptions, EChartsFieldConfig> = (
  dataSummary
) => {
  const score = scoreStream(dataSummary);
  return score == null ? undefined : [{ score }];
};
