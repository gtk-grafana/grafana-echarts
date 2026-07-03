// @todo figure out panel type vs series type
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
  // Per-field bar rendering overrides, honored only when the field renders as
  // `bar`. Overrides the panel-level `bar` config (except the coordinate-system
  // -global `gap`/`categoryGap`, which are panel-level only). See BarStyleConfig.
  bar?: BarStyleConfig;
}

/**
 * Bar-specific rendering options, shared by the panel-level config
 * (`PanelOptions.bar`) and the per-field override (`EChartsFieldConfig.bar`).
 * Only meaningful for `bar` series.
 *
 * `gap`/`categoryGap` map to ECharts' coordinate-system-global `barGap`/
 * `barCategoryGap`, so they are only honored from the panel-level config: a
 * per-field value would be ambiguous because ECharts shares them across all bar
 * series and only the last series' value takes effect.
 * https://echarts.apache.org/en/option.html#series-bar.barGap
 */
export interface BarStyleConfig {
  /** ECharts `barGap`, e.g. "30%" (gap between series in a category). */
  gap?: string;
  /** ECharts `barCategoryGap`, e.g. "20%" (gap between categories). */
  categoryGap?: string;
  /** ECharts `barWidth` in px. */
  width?: number;
  /** ECharts `barMaxWidth` in px. */
  maxWidth?: number;
  /** ECharts `barMinHeight` in px. */
  minHeight?: number;
  /** ECharts `itemStyle.borderWidth` in px. */
  borderWidth?: number;
  /** ECharts `itemStyle.borderType`. */
  borderType?: 'solid' | 'dashed' | 'dotted';
  /** ECharts `itemStyle.borderRadius` in px (the requested `barBorderRadius`). */
  borderRadius?: number;
  /** ECharts `itemStyle.opacity` (0-1). */
  opacity?: number;
  /** ECharts `showBackground`: draw a track behind each bar. */
  showBackground?: boolean;
  /** ECharts `backgroundStyle.color` for the track (requires `showBackground`). */
  backgroundColor?: string;
}
