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
// Hierarchy charts (treemap/sunburst) render a value-weighted tree rather than a
// cartesian axis. See echarts/converters/hierarchy.ts.
export type HierarchySeriesType = Extract<SeriesType, 'treemap' | 'sunburst'>;

/**
 * Series-type *selection* value: the concrete `SeriesType` plus the `'Auto'`
 * sentinel. `'Auto'` defers the concrete type to the panel-level auto-resolver
 * (`resolveAutoSeriesType`, which inspects the frame data) or, as a per-field
 * override, to the panel-level fallback. Kept separate so the base `SeriesType`
 * stays limited to real ECharts series types.
 */
export type SeriesTypeOption = SeriesType | 'Auto';

/**
 * Editor surface tier, controlling how many options the panel editor exposes:
 * `default` (critical/parity-only options, tracked per module in `parity.md`),
 * `advanced` (Default plus high-value ECharts-only and less-common core options,
 * gated via `showIf: isAdvancedEditorMode`), and `api` (JSON-only, never shown in
 * the editor UI; reserved for future full ECharts-API access). See
 * `docs/options-modes.md`.
 */
export type EditorMode = 'default' | 'advanced' | 'api';

/**
 * Pie (part-to-whole) slice-label content, matching core Grafana's
 * `PieChartLabels` (`@grafana/schema` doesn't re-export the raw enum, so the
 * string values are mirrored here): `name` (slice name), `value` (formatted slice
 * value), `percent` (share of the visible total). The panel's `displayLabels`
 * holds the selected set; an empty set hides the labels. See `getPieContentLabel`.
 */
export type PieLabel = 'name' | 'value' | 'percent';

/**
 * Pie (part-to-whole) slice-label overflow handling, mirroring ECharts'
 * `label.overflow`: `none` (no handling — the default), `truncate` (clip with an
 * ellipsis at `label.width`), `break` (wrap at word boundaries), `breakAll` (wrap
 * at any character). Advanced-only; drives `getPieLabelStyle`.
 * https://echarts.apache.org/en/option.html#series-pie.label.overflow
 */
export type PieLabelOverflow = 'none' | 'truncate' | 'break' | 'breakAll';

/**
 * Pie (part-to-whole) chart shape, matching core Grafana's `PieChartType`
 * (`@grafana/schema` doesn't re-export the raw enum, so the string values are
 * mirrored here): `pie` (full disc) or `donut` (a pie with a hole). The panel's
 * `pieType` selects it; rendered as the ECharts series radius. See `getPieRadius`.
 */
export type PieChartType = 'pie' | 'donut';

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
  seriesType?: SeriesTypeOption;
  // Per-field override for stacking, honored only when the field renders as
  // `bar`. Overrides the panel-level `stackSeries` default.
  stackSeries?: boolean;
  // Per-field y-axis placement. Fields are grouped onto one y-axis per distinct
  // unit; this controls which side that unit's axis renders on (or hides it).
  // Only `Left`, `Right`, `Hidden`, and `Auto` are meaningful for a y-axis.
  axisPlacement?: AxisPlacement;
}
export interface EChartsGraphFieldConfig extends GraphFieldConfig, EChartsFieldConfig {}
