import { type AxisPlacement, type GraphFieldConfig, type HideableFieldConfig } from '@grafana/schema';

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
export type CategoricalAxisSeriesType = Extract<SeriesType, 'line' | 'bar' | 'scatter' | 'effectScatter' | 'boxplot'>;
export type TimeAxisSupportsSeriesType = Extract<
  SeriesType,
  'line' | 'bar' | 'scatter' | 'effectScatter' | 'boxplot' | 'candlestick' | 'heatmap'
>;
export type CartesianSingleValueSeriesType = Extract<SeriesType, 'line' | 'bar' | 'scatter' | 'effectScatter'>;
export type MultiValueSeriesType = Extract<SeriesType, 'candlestick' | 'boxplot'>;
export type HeatmapSeriesType = Extract<SeriesType, 'heatmap'>;

/**
 * Per-field custom field config, registered via `useFieldConfig`'s
 * `useCustomConfig`. It lets a Grafana field override (by name, regex, type or
 * query) set the ECharts series type for matching fields, so a single panel can
 * mix cartesian types (e.g. a `line` over `bar` columns). The override is only
 * honored for cartesian types; the panel-level `seriesType` is the fallback.
 */
// Extends `HideableFieldConfig` so `custom.hideFrom` is typed for the non-graph
// families (pie/radar/heatmap); the legend visibility toggle writes it as a
// `byName` override (see `addHideFrom` in the modules and `seriesConfig.ts`).
export interface EChartsFieldConfig extends HideableFieldConfig {
  seriesType?: SeriesType;
  // Per-field override for stacking, honored only when the field renders as
  // `bar`. Overrides the panel-level `stackSeries` default.
  stackSeries?: boolean;
  // Per-field y-axis placement. Fields are grouped onto one y-axis per distinct
  // unit; this controls which side that unit's axis renders on (or hides it).
  // Only `Left`, `Right`, `Hidden`, and `Auto` are meaningful for a y-axis.
  axisPlacement?: AxisPlacement;
}
export interface EChartsGraphFieldConfig extends GraphFieldConfig, EChartsFieldConfig {}
