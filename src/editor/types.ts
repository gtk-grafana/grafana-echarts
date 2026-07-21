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

// Funnel joins pie/radar as a non-cartesian, categorical-only type: it is a
// part-to-whole variant sharing the pie slice model (see editor/funnel.ts).
export type CategoricalOnlySeriesType = Extract<SeriesType, 'pie' | 'radar' | 'funnel'>;
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
/** Funnel render type of the part-to-whole family. Reuses the pie slice model. */
export type FunnelSeriesType = Extract<SeriesType, 'funnel'>;
/**
 * Render variants of the part-to-whole family, selected per panel via the
 * panel-level `seriesType`: `pie` (radial) and `funnel` (stacked trapezoids).
 * Both are built from the same categorical slice model (see resolvePieSlices);
 * gauge is a planned third variant tracked separately. Mirrors
 * `HierarchySeriesType` (treemap/sunburst) for the hierarchy family.
 */
export type PartToWholeSeriesType = Extract<SeriesType, 'pie' | 'funnel'>;

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

/** Pie slice-label placement: outside (leader lines), inside the slice, or center (donut hole). */
export type PieLabelPosition = 'outside' | 'inside' | 'center';

/**
 * Pie (part-to-whole) slice-label overflow handling, mirroring ECharts'
 * `label.overflow`: `none` (no handling — the default), `truncate` (clip with an
 * ellipsis at `label.width`), `break` (wrap at word boundaries), `breakAll` (wrap
 * at any character). Advanced-only; drives `getPieLabelStyle`.
 * https://echarts.apache.org/en/option.html#series-pie.label.overflow
 */
export type PieLabelOverflow = 'none' | 'truncate' | 'break' | 'breakAll';

/**
 * Pie (part-to-whole) legend values, matching core Grafana's `PieChartLegendValues`
 * (`@grafana/schema` doesn't re-export the raw enum, so the string values are
 * mirrored here): `value` (formatted slice value) and `percent` (share of the
 * visible total). Stored on the legend options as `legend.values` (core parity);
 * an empty/unset set shows slice names only. See `buildPieLegendItems`.
 */
export type PieLegendValue = 'value' | 'percent';

/**
 * Pie (part-to-whole) chart shape, matching core Grafana's `PieChartType`
 * (`@grafana/schema` doesn't re-export the raw enum, so the string values are
 * mirrored here): `pie` (full disc) or `donut` (a pie with a hole). The panel's
 * `pieType` selects it; rendered as the ECharts series radius. See `getPieRadius`.
 */
export type PieChartType = 'pie' | 'donut';

/**
 * Pie (part-to-whole) rose (Nightingale) rendering: `none` (a plain pie, angle
 * only), `radius` (slice value encoded as its radius), or `area` (slice value
 * encoded as its area). ECharts-only, so gated behind Advanced editor mode. The
 * `'none'` sentinel maps to ECharts' `false`; see `getPieRoseType`.
 */
export type PieRoseType = 'none' | 'radius' | 'area';

/**
 * Pie (part-to-whole) slice-selection mode (Advanced), mapping to the ECharts
 * `series.selectedMode`: `off` (no selection; rendered as `false`), `single` (one
 * slice at a time), or `multiple`. A selected slice is offset outward by
 * `selectedOffset` (explode). See `getPieSelection`.
 */
export type PieSelectedMode = 'off' | 'single' | 'multiple';

/**
 * Pie (part-to-whole) emphasis focus (Advanced), mapping to the ECharts
 * `series.emphasis.focus`: `none` (no fade; the ECharts default, omitted), `self`
 * (fade all but the hovered slice), or `series` (highlight the whole series). See
 * `getPieEmphasis`.
 */
export type PieEmphasisFocus = 'none' | 'self' | 'series';

/**
 * Funnel (part-to-whole) layout direction, mapping to the ECharts funnel
 * `series.orient` (`LayoutOrient`): `vertical` stacks trapezoids top-to-bottom
 * (the default), `horizontal` lays them left-to-right. See `getFunnelOrient`.
 * https://echarts.apache.org/en/option.html#series-funnel.orient
 */
export type FunnelOrient = 'vertical' | 'horizontal';

/**
 * Funnel (part-to-whole) cross-axis alignment, mapping to the ECharts funnel
 * `series.funnelAlign`. Only meaningful for the vertical orient, where it sets the
 * horizontal alignment of the narrowing trapezoids: `center` (the default),
 * `left`, or `right`. A horizontal funnel only supports center alignment, so the
 * option is hidden and the value is forced to center at render (a stored
 * `left`/`right` would otherwise break the layout). See `getFunnelAlign`.
 * https://echarts.apache.org/en/option.html#series-funnel.funnelAlign
 */
export type FunnelAlign = 'left' | 'center' | 'right';

/**
 * Funnel (part-to-whole) slice-label placement, a subset of the ECharts funnel
 * `label.position`. The offered choices depend on the funnel orientation (see
 * `funnelLabelPositionVerticalOptions` / `funnelLabelPositionHorizontalOptions`):
 * a vertical funnel takes `inside` (on the trapezoid — the plugin default, a clean
 * part-to-whole read) or `left`/`right` (outside with a leader line); a horizontal
 * funnel takes `center` (on the trapezoid) or `top`/`bottom` (outside). The
 * on-trapezoid placements (`inside`, `center`) get a per-slice contrast color; see
 * `resolveFunnelLabelColor`. Reuses the pie Name/Value/Percent label content. See
 * `getFunnelLabel`.
 * https://echarts.apache.org/en/option.html#series-funnel.label.position
 */
export type FunnelLabelPosition = 'inside' | 'left' | 'right' | 'top' | 'bottom' | 'center';

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
