import { type GraphFieldConfig } from '@grafana/schema';

export type SeriesType =
  | 'line'
  | 'bar'
  | 'pie'
  | 'scatter'
  | 'effectScatter'
  | 'radar'
  | 'tree'
  | 'treemap'
  | 'sunburst'
  | 'boxplot'
  | 'candlestick'
  | 'heatmap'
  | 'map'
  | 'parallel'
  | 'lines'
  | 'graph'
  | 'sankey'
  | 'funnel'
  | 'gauge'
  | 'pictorialBar'
  | 'themeRiver'
  | 'chord'
  | 'custom';


export type CategoricalOnlySeriesType = Extract<SeriesType, 'pie' | 'radar'>;
export type CategoricalAxisSeriesType = Extract<SeriesType, 'line' | 'bar' | 'scatter' | 'effectScatter' >;
export type CartesianSingleValueSeriesType = Extract<SeriesType, 'line' | 'bar' | 'scatter' | 'effectScatter'>;
export type CartesianMultiValueSeriesType = Extract<SeriesType, 'candlestick' | 'boxplot'>;
export type HeatmapSeriesType = Extract<SeriesType, 'heatmap'>
/**
 * Per-field custom field config, registered via `useFieldConfig`'s
 * `useCustomConfig`. It lets a Grafana field override (by name, regex, type or
 * query) set the ECharts series type for matching fields, so a single panel can
 * mix cartesian types (e.g. a `line` over `bar` columns). The override is only
 * honored for cartesian types; the panel-level `seriesType` is the fallback.
 */
export interface EChartsFieldConfig {
  seriesType?: SeriesType;
  // Per-field override for stacking, honored only when the field renders as
  // `bar`. Overrides the panel-level `stackSeries` default.
  stackSeries?: boolean;
}
export interface EChartsGraphFieldConfig extends GraphFieldConfig, EChartsFieldConfig {}
