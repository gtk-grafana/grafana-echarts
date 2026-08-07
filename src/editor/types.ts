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
/**
 * Render types the multivariate family hosts: `radar` and `parallel` (parallel
 * coordinates). Both use the same categorical model but different coordinate
 * systems, so the family dispatches on the concrete type. See
 * `modules/multivariate/parity.md`.
 */
export type MultivariateSeriesType = Extract<SeriesType, 'radar' | 'parallel'>;
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
 * Relations (graph / flow) render types: a set of nodes plus the links between
 * them. `graph` ships today; `sankey` and `chord` are planned variants of the same
 * family, since all three ECharts series read the identical node/link input. Built
 * from the field-based graph contract — see echarts/converters/graphWide.ts and
 * `data-plane/graph-wide.md`. `lines` is deliberately excluded: it needs
 * coordinate-pair polylines, not node references (see `todo/node-graph.md`).
 */
export type RelationsSeriesType = Extract<SeriesType, 'graph' | 'sankey' | 'chord'>;
/**
 * Relations graph layout (ECharts `series.graph.layout`): `force` (physics
 * simulation), `circular` (nodes on a ring), or `none` (honor server-provided
 * `fixedx`/`fixedy`). Default-tier. See `getGraphLayout`.
 */
export type RelationsGraphLayout = 'force' | 'circular' | 'none';
/**
 * How a relations link is colored — ECharts `series.graph.lineStyle.color` accepts
 * these keywords: inherit the `source` node's color, the `target`'s, or blend both
 * as a `gradient`. An explicit per-edge `color` field always wins. Advanced-only.
 * See `getGraphLinkColor`.
 */
export type RelationsLinkColor = 'source' | 'target' | 'gradient';
/**
 * How a long relations node label is handled at `relationsLabelWidth` — the same
 * shape as `lib/echarts/options/labels.LabelOverflow`, spelled out per family the way
 * `PieLabelOverflow` is so this module stays free of `lib` imports. Advanced;
 * defaults to `truncate`, since a topology's node names are frequently long enough to
 * reach a neighbour. See `getRelationsLabelStyle`.
 */
export type RelationsLabelOverflow = 'none' | 'truncate' | 'break' | 'breakAll';
/**
 * Sankey flow direction (ECharts `series.sankey.orient`, typed `LayoutOrient`
 * there): `horizontal` lays the node columns left-to-right, `vertical` top-to-bottom.
 * Default-tier. See `getSankeyOrient`.
 */
export type RelationsSankeyOrient = 'horizontal' | 'vertical';
/**
 * Where a sankey places nodes that could sit in more than one column — ECharts
 * `series.sankey.nodeAlign`: `justify` pushes sinks to the far edge, `left`/`right`
 * pin every node to the earliest/latest column it can occupy. Default-tier.
 * See `getSankeyNodeAlign`.
 */
export type RelationsSankeyNodeAlign = 'justify' | 'left' | 'right';
/** Funnel render type of the part-to-whole family. Reuses the pie slice model. */
export type FunnelSeriesType = Extract<SeriesType, 'funnel'>;
/**
 * Single-axis stream charts. `themeRiver` is the only ECharts series that
 * *requires* the `singleAxis` coordinate system (its `dependencies` are
 * `['singleAxis']`), and the only member today. See `data-plane/stream.md`.
 */
export type StreamSeriesType = Extract<SeriesType, 'themeRiver'>;
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
 * Radar (multivariate) grid shape (ECharts `radar.shape`): `polygon` (straight
 * edges between axes, the default) or `circle` (a smooth ring). Advanced-only.
 * See `getRadarComponent`.
 */
export type RadarShape = 'polygon' | 'circle';

/**
 * Parallel-coordinates (multivariate) layout direction (ECharts
 * `parallel.layout`): `horizontal` (axes laid out left-to-right, the ECharts
 * default) or `vertical` (axes top-to-bottom). Advanced-only. See
 * `getParallelComponent`.
 */
export type ParallelLayout = 'horizontal' | 'vertical';

/**
 * Cartesian "Show values" mode (Bar-chart parity): whether per-point value labels
 * render. `always` draws them; `never` hides them; `auto` currently resolves to
 * hidden (reserved for a future fit-based heuristic). Unset panels render no
 * labels, so existing charts are unchanged. See `getCartesianValueLabel`.
 */
export type CartesianShowValues = 'auto' | 'always' | 'never';

/**
 * Placement of the cartesian value label relative to its point/bar (ECharts
 * `series.label.position`), Advanced-only. Defaults to `top`. See
 * `getCartesianValueLabel`.
 */
export type CartesianValueLabelPosition = 'top' | 'bottom' | 'inside' | 'left' | 'right';

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
 * Tri-state override for a density-driven cartesian performance lever (Advanced):
 * `auto` defers to the threshold in `lib/echarts/performance/constants.ts`,
 * `always` and `never` force the lever on or off. Unset resolves to `auto`.
 *
 * Used by `performance.showPoints` (ECharts `series.showSymbol` — the render-cost
 * lever behind the 500-series regression). Kept as a shared named type rather
 * than inlined because it is the shape any future density-driven override should
 * take, mirroring core Grafana's reusable `VisibilityMode`. Animation is
 * deliberately *not* one of these: it is a plain off-by-default boolean, since
 * density thresholds could not fire early enough to be useful (see
 * `resolveAnimation`). See `lib/echarts/performance/resolvers.ts`.
 */
export type PerformanceMode = 'auto' | 'always' | 'never';

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
 * Where the stream (single-axis) family reads its river layers from:
 *
 * - `auto` — pick per frame: a long-shaped frame (time + exactly one numeric +
 *   at least one string field) pivots on its first string field, anything else
 *   maps one layer per numeric field. The default.
 * - `fields` — always one layer per numeric field (the wide/multi shape).
 * - `labels` — always pivot on the first string field (the long shape).
 *
 * The explicit modes exist because the ambiguous case is real: a SQL table of
 * `time, level, count, errors` can legitimately mean "two metrics" or "one metric
 * per level". Exposed as the Default-tier "Layers from" radio. See
 * `data-plane/stream.md`.
 */
export type StreamLayerSource = 'auto' | 'fields' | 'labels';

/**
 * Render variant of the stream (single-axis) family: `river` (a themeRiver — one
 * stacked ribbon per layer over one shared axis) or `bubble` (a punch-card
 * timeline — one `singleAxis` *per* layer with a `scatter` whose symbol size
 * encodes the value).
 *
 * Deliberately **not** the shared panel-level `seriesType`, unlike every other
 * multi-variant family. `seriesType` is the plugin's routing key
 * (`resolveChartModule`) and its values are ECharts series names owned by exactly
 * one family — but `scatter` is already owned by cartesian, so selecting it here
 * would route a stream panel into `cartesianChartModule`. Keeping the variant in a
 * family-local option leaves `SeriesType` an honest one-family-per-name union (the
 * premise of `data-plane/echarts-coverage.md`'s master table) and leaves the shared
 * registry untouched. See `modules/stream/parity.md`.
 */
export type StreamChartType = 'river' | 'bubble';

/**
 * Stream hover emphasis (ECharts `series-themeRiver.emphasis.focus`): `none`
 * (ECharts' default — only the hovered ribbon lifts), `self` (fade every other
 * ribbon), or `series` (highlight the whole river). Mirrors `PieEmphasisFocus`;
 * `themeRiver` emits one series, so `series` reads as "highlight everything".
 * https://echarts.apache.org/en/option.html#series-themeRiver.emphasis.focus
 */
export type StreamEmphasisFocus = 'none' | 'self' | 'series';

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

/** ECharts line types, the three `lineStyle.type` keywords a stroked edge can take. */
export type RelationsLineType = 'solid' | 'dashed' | 'dotted';

/**
 * Per-mark custom field config for the relations family.
 *
 * Under the field-based graph contract one node is one **field** and one edge is one
 * **field** (see `data-plane/graph-wide.md`), so everything the row form carried as a
 * per-row column — `noderadius`, `subtitle`, `thickness`, `strokedasharray` — is
 * ordinary per-field config here, editable through a Grafana override that names the
 * mark. `converters/legacyToWide.ts` writes exactly these keys when it converts a row
 * response, so a legacy dashboard and a hand-configured override end up in the same
 * place. Read back in `converters/graphWide.ts`.
 *
 * Node keys and edge keys share one interface because a field override cannot know
 * which frame its field came from; the editors are grouped by category instead, and
 * each key is simply ignored on the wrong kind of mark.
 */
export interface EChartsRelationsFieldConfig extends EChartsFieldConfig {
  /** Node diameter in px (ECharts `symbolSize`), overriding the panel-level node size. */
  nodeRadius?: number;
  /** Second tooltip line for a node. The row form's `subtitle` column. */
  subtitle?: string;
  /** Pinned node position. All-or-nothing: the layout only honours it when every node pins both. */
  fixedX?: number;
  fixedY?: number;
  /**
   * Grafana icon name for a node, carried by the conversion but **not rendered**:
   * ECharts takes a `symbol`, and resolving Grafana's icon set to one is unbuilt.
   * Typed so the conversion's output is described; deliberately given no editor, so
   * the pane offers no control that silently does nothing. See
   * `todo/graph-wide-migration.md`.
   */
  icon?: string;
  /** Edge stroke width (ECharts `lineStyle.width`). The row form's `thickness`. */
  lineWidth?: number;
  /** Edge stroke pattern. The row form's `strokedasharray`, as a choice rather than an approximation. */
  lineType?: RelationsLineType;
  /** Edge curvature 0–1, overriding the panel-level "Link curveness" for this edge. */
  curveness?: number;
}
