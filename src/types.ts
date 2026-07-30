import { type ReduceDataOptions, type StandardOptionConfig } from '@grafana/data';
import {
  type OptionsWithLegend,
  type OptionsWithTooltip,
  type SortOrder,
  type VizLegendOptions,
} from '@grafana/schema';
import { type editorModePath, type seriesTypePath } from 'editor/constants';
import {
  type streamBorderColorPath,
  type streamBorderWidthPath,
  type streamBoundaryGapPath,
  type streamBubbleMaxSizePath,
  type streamChartTypePath,
  type streamEmphasisFocusPath,
  type streamFillOpacityPath,
  type streamLabelFontSizePath,
  type streamLabelMarginPath,
  type streamLayerSourcePath,
  type streamShowLabelsPath,
} from 'editor/stream';
import {
  type CartesianShowValues,
  type CartesianValueLabelPosition,
  type EditorMode,
  type FunnelAlign,
  type FunnelLabelPosition,
  type FunnelOrient,
  type PieChartType,
  type PieEmphasisFocus,
  type PieLabel,
  type PieLabelOverflow,
  type PieLabelPosition,
  type PieLegendValue,
  type PieRoseType,
  type PerformanceMode,
  type PieSelectedMode,
  type ParallelLayout,
  type RadarShape,
  type SeriesTypeOption,
  type StreamChartType,
  type StreamEmphasisFocus,
  type StreamLayerSource,
} from 'editor/types';

import {
  type HeatmapColorScalePlacement,
  type HeatmapColorScheme,
  type HeatmapLayout,
} from 'lib/echarts/options/types';

export type { EChartsFieldConfig } from 'editor/types';
export type { HeatmapColorScalePlacement } from 'lib/echarts/options/types';

/**
 * The standard Core Grafana `legend` (`VizLegendOptions`) plus the pie's
 * `values` (Percent / Value), mirroring core Grafana's `PieChartLegendOptions`.
 * A subtype of `VizLegendOptions`, so it satisfies `OptionsWithLegend` for the
 * other chart families (which ignore `values`); only the pie reads it. See
 * `addPieLegendValueOptions` and `buildPieLegendItems`.
 */
export interface PieChartLegendOptions extends VizLegendOptions {
  values?: PieLegendValue[];
}

/**
 * `OptionsWithLegend` contributes the standard Core Grafana `legend`
 * (VizLegendOptions) config, registered via `commonOptionsBuilder.addLegendOptions`.
 *
 * `tooltip.mode` selects the ECharts native tooltip trigger (Single -> item,
 * All -> axis, Hidden -> off); see `tooltipTriggerForMode`.
 *
 * `heatmapColorScheme` selects the color gradient used for the heatmap cell
 * layer (only relevant when a heatmap frame is present).
 *
 * @todo we probably want to build options around echarts API instead of using Grafana's
 */
export interface PanelOptions extends OptionsWithLegend, StandardOptionConfig, OptionsWithTooltip {
  // Widen the inherited `legend` (`VizLegendOptions`) with the pie's `values`.
  legend: PieChartLegendOptions;

  // Optional, and may be `'Auto'`: set by the cartesian panel's Series type
  // picker (default `'Auto'`), a Visualization Suggestion, or persisted dashboard
  // JSON; `undefined` on legacy panels. `resolveSeriesType` / `resolveChartModule`
  // resolve `'Auto'`/`undefined` to a concrete type from the data.
  [seriesTypePath]?: SeriesTypeOption;

  /**
   * Editor surface tier (Default / Advanced / API). Gates editor option
   * visibility via `showIf: isAdvancedEditorMode`; `'api'` is JSON-only. Defaults
   * to `EDITOR_MODE_DEFAULT` (`default`) when unset. See `docs/options-modes.md`.
   */
  [editorModePath]?: EditorMode;
  heatmapColorScheme?: HeatmapColorScheme;

  /**
   * Heatmap coordinate model: continuous interval cells (`binned`, the dataplane
   * heatmap default) vs a categorical `matrix` grid (native ECharts heatmap).
   */
  heatmapLayout?: HeatmapLayout;

  /** Placement of the heatmap color scale (ECharts `visualMap`). */
  heatmapColorScale?: { placement: HeatmapColorScalePlacement };

  /**
   * Bar series stacking
   */
  stackSeries?: boolean;

  /**
   * Grafana's standard reduce options (added via `addStandardDataReduceOptions`)
   * driving `getFieldDisplayValues` in the pie slice resolver: `calcs[0]` is the
   * reducer per slice, `values` toggles Calculate vs. All values, `limit` caps
   * All-values rows, and `fields` selects which numeric fields become slices.
   * Defaults (Calculate, `PIE_CALC_DEFAULT` = sum) are applied when unset.
   */
  reduceOptions?: ReduceDataOptions;

  /**
   * Pie (part-to-whole) chart type (Grafana Pie chart "Pie chart type" parity):
   * `pie` (full disc) or `donut` (a pie with a hole). Defaults to `PIE_TYPE_DEFAULT`
   * (`pie`) when unset. Rendered as the ECharts series radius; see `getPieRadius`.
   */
  pieType?: PieChartType;

  /**
   * Pie (part-to-whole) rose (Nightingale) rendering (ECharts-only, Advanced):
   * `none` (plain pie), `radius` (value → slice radius), or `area` (value → slice
   * area). Defaults to `PIE_ROSE_TYPE_DEFAULT` (`none`) when unset; the `'none'`
   * sentinel maps to ECharts' `false` so the key is emitted only when opted in,
   * leaving default renders unchanged. See `getPieRoseType`.
   */
  roseType?: PieRoseType;

  /**
   * Pie (part-to-whole) slice-label content (Grafana Pie chart "Labels" parity):
   * which of Name / Value / Percent render on each slice. Empty/unset hides the
   * labels (matching core). See `getPieContentLabel`.
   */
  displayLabels?: PieLabel[];

  /**
   * Pie (part-to-whole) slice-label placement (ECharts-only, Advanced): `outside`
   * (leader lines, the default), `inside` (on the slice — fits dense pies), or
   * `center` (the donut hole — a KPI-style readout). Defaults to
   * `PIE_LABEL_POSITION_DEFAULT` (`outside`) when unset. Threaded through
   * `getPieContentLabel` as the ECharts `label.position`.
   */
  labelPosition?: PieLabelPosition;

  /**
   * Pie (part-to-whole) center-readout reducer (Advanced): a Grafana `ReducerID`
   * that aggregates the visible slice values into the persistent donut-center
   * readout, shown only with `labelPosition: 'center'`. Unset leaves the center
   * empty until a slice is hovered (which shows that slice's value). See
   * `getPieCenterTitle`.
   */
  centerValueReducer?: string;

  /**
   * Pie (part-to-whole) slice sorting (Grafana Pie chart "Slice sorting" parity):
   * order slices by value — `desc` (largest first), `asc` (smallest first), or
   * `none` (data order). Defaults to `PIE_SORT_DEFAULT` (`desc`) when unset. Sorts
   * the shared slice model so chart, legend, and tooltip agree. See `resolvePieSlices`.
   */
  sort?: SortOrder;

  /**
   * Pie (part-to-whole) minimum slice angle in degrees (ECharts `series.minAngle`,
   * Advanced-only). Small long-tail slices are enlarged to at least this angle so
   * they stay visible and clickable. Defaults to `PIE_MIN_ANGLE_DEFAULT` (`0`, no
   * minimum) and is omitted from the series when 0, so existing renders are
   * unchanged. See `getPieMinAngle`.
   */
  minAngle?: number;

  /**
   * Pie (part-to-whole) arc start angle in degrees (Advanced-only; ECharts
   * `series.startAngle`). 90 = top. Defaults to `PIE_START_ANGLE_DEFAULT` (`90`)
   * when unset. Together with `endAngle` this enables half-pie / semicircle-donut
   * (gauge-like) layouts. See `getPieAngles`.
   */
  startAngle?: number;

  /**
   * Pie (part-to-whole) arc end angle in degrees (Advanced-only; ECharts
   * `series.endAngle`). Unset → `'auto'` (a full 360° sweep). E.g. start 180 /
   * end 360 renders a half-pie. See `getPieAngles`.
   */
  endAngle?: number;

  /**
   * Advanced-only: pie slice-label font size (ECharts `label.fontSize`). Unset
   * uses the theme font size. See `getPieLabelStyle`.
   */
  labelFontSize?: number;

  /**
   * Advanced-only: pie slice-label overflow handling (ECharts `label.overflow`).
   * Unset / `none` leaves long names unwrapped. See `getPieLabelStyle`.
   */
  labelOverflow?: PieLabelOverflow;

  /**
   * Advanced-only: pie slice-label wrap/clip width in px (ECharts `label.width`),
   * paired with `labelOverflow`. See `getPieLabelStyle`.
   */
  labelWidth?: number;

  /**
   * Advanced-only: minimum slice angle (degrees) below which the slice label is
   * hidden (ECharts `series.minShowLabelAngle`). `0`/unset shows all labels.
   */
  minShowLabelAngle?: number;

  /**
   * Advanced-only: slice separation border width in px (ECharts
   * `itemStyle.borderWidth`). `0`/unset draws no separator. See `getPieItemStyle`.
   */
  sliceBorderWidth?: number;

  /**
   * Advanced-only: slice separation border color (ECharts `itemStyle.borderColor`),
   * paired with `sliceBorderWidth`. See `getPieItemStyle`.
   */
  sliceBorderColor?: string;

  /**
   * Advanced-only: custom pie outer radius as a percentage of the panel (ECharts
   * `series.radius`). Unset uses the `getPieRadius` default. See `getPieRadius`.
   */
  outerRadius?: number;

  /**
   * Advanced-only: custom pie inner (hole) radius as a percentage of the panel.
   * Unset uses the pie/donut default. See `getPieRadius`.
   */
  innerRadius?: number;

  /**
   * Advanced-only: custom pie center x/y as a percentage of the panel (ECharts
   * `series.center`). Unset leaves the ECharts default (centered). See `getPieCenter`.
   */
  centerX?: number;
  centerY?: number;

  /**
   * Pie (part-to-whole) slice-selection mode (Advanced): `off` / `single` /
   * `multiple`. A selected slice explodes outward by `selectedOffset`. Omits its
   * key at the `off` default. See `getPieSelection`.
   */
  selectedMode?: PieSelectedMode;

  /**
   * Pie (part-to-whole) selected-slice offset in px (Advanced): how far a selected
   * slice is pushed outward. Only meaningful when `selectedMode` is not `off`. See
   * `getPieSelection`.
   */
  selectedOffset?: number;

  /**
   * Pie (part-to-whole) slice corner radius in px (Advanced): rounds each slice's
   * corners via the ECharts `itemStyle.borderRadius`. Defaults to
   * `PIE_BORDER_RADIUS_DEFAULT` (0 = square corners), which omits the key. See
   * `getPieBorderRadius` / `getPieItemStyle`.
   */
  sliceBorderRadius?: number;

  /**
   * Pie (part-to-whole) hover emphasis focus (Advanced): `none` (default) / `self`
   * / `series`. Omits its key at the `none` default. See `getPieEmphasis`.
   */
  emphasisFocus?: PieEmphasisFocus;

  /**
   * Pie (part-to-whole) hover emphasis scale (Advanced): whether the hovered slice
   * enlarges. Defaults to `PIE_EMPHASIS_SCALE_DEFAULT` (`true`, matching ECharts)
   * so the switch state matches the actual hover behavior; set `false` to disable
   * the enlarge. See `getPieEmphasis`.
   */
  emphasisScale?: boolean;

  /**
   * Pie (part-to-whole) slice-label color (Advanced): overrides the theme text
   * color used by `getPieLabelStyle`. Unset keeps the theme color. See
   * `getPieContentLabel`.
   */
  labelColor?: string;

  /**
   * Pie (part-to-whole) zero-sum rendering (Advanced): when every slice is 0,
   * still draw an even pie (`stillShowZeroSum`). ECharts default is `true`; only
   * the `false` override is emitted. See `getPieEmptyState`.
   */
  stillShowZeroSum?: boolean;

  /**
   * Pie (part-to-whole) empty-circle rendering (Advanced): draw a placeholder
   * circle when there's no data. ECharts default is `true`; only the `false`
   * override is emitted. See `getPieEmptyState`.
   */
  showEmptyCircle?: boolean;

  /**
   * Pie (part-to-whole) slice direction (Advanced): lay slices out clockwise.
   * ECharts default is `true`; only the `false` override is emitted. See
   * `getPieOrientation`.
   */
  clockwise?: boolean;

  /**
   * Pie (part-to-whole) label de-clutter (Advanced): adjust label positions to
   * avoid overlap. ECharts default is `true`; only the `false` override is
   * emitted. See `getPieOrientation`.
   */
  avoidLabelOverlap?: boolean;

  /**
   * Pie (part-to-whole) slice-label text shadow (Advanced): re-enable the ECharts
   * label drop shadow that `getPieLabelStyle` zeroes by default. Unset keeps the
   * zeroed (flat) style.
   */
  labelTextShadow?: boolean;

  /**
   * Pie (part-to-whole) slice-label text stroke (Advanced): re-enable the ECharts
   * label contrast stroke that `getPieLabelStyle` zeroes by default. Unset keeps
   * the zeroed (flat) style.
   */
  labelTextStroke?: boolean;

  /**
   * Cartesian "Show values" mode (Default tier, Bar-chart parity): whether
   * per-point value labels render (`auto` / `always` / `never`). Unset renders no
   * labels, so existing charts are unchanged. See `getCartesianValueLabel`.
   */
  showValues?: CartesianShowValues;

  /**
   * Cartesian value-label placement (Advanced; ECharts `series.label.position`).
   * Defaults to `top`. Only meaningful when `showValues` draws labels. See
   * `getCartesianValueLabel`.
   */
  valueLabelPosition?: CartesianValueLabelPosition;

  /**
   * Cartesian bar width as a percentage of the category band (Advanced; ECharts
   * `series.barWidth`). Unset uses ECharts' auto width; `bar` series only. See
   * `getBarWidth`.
   */
  barWidth?: number;

  /**
   * Cartesian bar corner radius in px (Advanced; ECharts `itemStyle.borderRadius`).
   * `0` (default) draws square corners and omits the key; `bar` series only. See
   * `getCartesianItemStyle`.
   */
  barRadius?: number;

  /**
   * Cartesian line width in px (Advanced; ECharts `lineStyle.width`). Unset uses
   * ECharts' default stroke; `line` series only. See `getCartesianLineStyle`.
   */
  lineWidth?: number;

  /**
   * Cartesian line fill opacity 0–100 (Advanced; ECharts `areaStyle.opacity`). A
   * non-zero value turns a line into an area chart; `0` (default) is a plain line;
   * `line` series only. See `getCartesianAreaStyle`.
   */
  fillOpacity?: number;

  /**
   * Cartesian point (symbol) size in px (Advanced; ECharts `symbolSize`). `0`
   * hides the points; unset uses ECharts' default symbol; line/scatter series.
   * See `getCartesianSymbol`.
   */
  pointSize?: number;

  /**
   * Cartesian x-axis tick label rotation in degrees (Advanced; ECharts
   * `xAxis.axisLabel.rotate`). `0` (default) keeps labels horizontal. See
   * `getXTickRotate`.
   */
  xTickRotate?: number;

  /**
   * Radar (multivariate) fill area (Default tier; ECharts `series.areaStyle`):
   * fill each polygon with a uniform-opacity tint. Off/unset outlines only
   * (unchanged). See `getRadarAreaStyle`.
   */
  radarFillArea?: boolean;

  /**
   * Radar grid shape (Advanced; ECharts `radar.shape`): `polygon` (default) or
   * `circle`. See `getRadarComponent`.
   */
  radarShape?: RadarShape;

  /**
   * Radar line width in px (Advanced; ECharts `series.lineStyle.width`). Unset
   * uses ECharts' default stroke. See `getRadarLineStyle`.
   */
  radarLineWidth?: number;

  /**
   * Radar vertex symbol size in px (Advanced; ECharts `series.symbolSize`). `0`
   * hides the markers; unset uses ECharts' default. See `getRadarSymbol`.
   */
  radarSymbolSize?: number;

  /**
   * Radar ring count (Advanced; ECharts `radar.splitNumber`). Unset uses ECharts'
   * default (5 rings). See `getRadarComponent`.
   */
  radarSplitNumber?: number;

  /**
   * Parallel (multivariate) smooth lines (Default tier; ECharts `series.smooth`):
   * curve each polyline through its axis crossings rather than drawing straight
   * segments. Off/unset draws straight segments (unchanged). See `buildParallelOption`.
   */
  parallelSmooth?: boolean;

  /**
   * Parallel layout direction (Advanced; ECharts `parallel.layout`): `horizontal`
   * (axes left-to-right, the default) or `vertical` (axes top-to-bottom). See
   * `getParallelComponent`.
   */
  parallelLayout?: ParallelLayout;

  /**
   * Parallel line width in px (Advanced; ECharts `series.lineStyle.width`). Unset
   * uses ECharts' default stroke. See `getParallelLineStyle`.
   */
  parallelLineWidth?: number;

  /**
   * Parallel line opacity 0–100 (Advanced; ECharts `series.lineStyle.opacity`).
   * Unset uses ECharts' default; lowering it de-clutters dense line bundles. See
   * `getParallelLineStyle`.
   */
  parallelLineOpacity?: number;

  /**
   * Funnel (part-to-whole) layout direction ("Funnel" category): `vertical`
   * (default) or `horizontal`. Defaults to `FUNNEL_ORIENT_DEFAULT` (`vertical`);
   * omitted from the series at the default. See `getFunnelOrient`.
   */
  funnelOrient?: FunnelOrient;

  /**
   * Funnel (part-to-whole) cross-axis alignment ("Funnel" category): `center`
   * (default), `left`, or `right`. Only applies to the vertical orient — a
   * horizontal funnel forces center (the option is hidden and the value coerced at
   * render). Defaults to `FUNNEL_ALIGN_DEFAULT` (`center`); omitted at the default.
   * See `getFunnelAlign`.
   */
  funnelAlign?: FunnelAlign;

  /**
   * Funnel (part-to-whole) gap in px between trapezoids ("Funnel" category; ECharts
   * `series.gap`). Defaults to `FUNNEL_GAP_DEFAULT` (`0`), which omits the key.
   * See `getFunnelGap`.
   */
  funnelGap?: number;

  /**
   * Funnel (part-to-whole) minimum trapezoid extent as a percentage of the layout
   * box ("Funnel" category; ECharts `series.minSize`). Unset falls back to the
   * ECharts default (`'0%'`), so the key is omitted. See `getFunnelSize`.
   */
  funnelMinSize?: number;

  /**
   * Funnel (part-to-whole) maximum trapezoid extent as a percentage of the layout
   * box ("Funnel" category; ECharts `series.maxSize`). Unset falls back to the
   * ECharts default (`'100%'`), so the key is omitted. See `getFunnelSize`.
   */
  funnelMaxSize?: number;

  /**
   * Funnel (part-to-whole) slice-label placement ("Funnel" category; ECharts
   * `label.position`). The offered choices depend on the orientation: a vertical
   * funnel takes `inside` (default), `left`, or `right`; a horizontal funnel takes
   * `center`, `top`, or `bottom`. The on-trapezoid placements (`inside`/`center`)
   * get a per-slice contrast color. Reuses the pie Name/Value/Percent label
   * content. Defaults to `FUNNEL_LABEL_POSITION_DEFAULT` (`inside`). See
   * `getFunnelLabel` and `resolveFunnelLabelColor`.
   */
  funnelLabelPosition?: FunnelLabelPosition;

  /**
   * Stream (single-axis) render variant ("Stream" category): `river` (stacked
   * ribbons over one shared axis) or `bubble` (a punch-card timeline, one axis per
   * layer). Defaults to `STREAM_CHART_TYPE_DEFAULT` (`river`).
   *
   * Family-local rather than the shared `seriesType` because `scatter` — the series
   * the bubble emits — is already routed to the cartesian family; see
   * {@link StreamChartType}.
   */
  [streamChartTypePath]?: StreamChartType;

  /**
   * Stream bubble-variant largest symbol diameter in px (Advanced, bubble only;
   * ECharts `series-scatter.symbolSize`). Sizes scale from this by area. Defaults to
   * `STREAM_BUBBLE_MAX_SIZE_DEFAULT`. See `resolveBubbleSymbolSize`.
   */
  [streamBubbleMaxSizePath]?: number;

  /**
   * Stream (single-axis) layer source: where the river layers come from —
   * `auto` (infer per frame), `fields` (one layer per numeric field), or `labels`
   * (pivot on the first string field). Defaults to `STREAM_LAYER_SOURCE_DEFAULT`
   * (`auto`) when unset. Default tier ("Stream" category). See `frameToStream` and
   * `data-plane/stream.md`.
   */
  [streamLayerSourcePath]?: StreamLayerSource;

  /**
   * Stream layer labels ("Stream" category; ECharts `series.label.show`): draw each
   * ribbon's name on the band itself. Defaults to `STREAM_SHOW_LABELS_DEFAULT`
   * (**off**) — ECharts shows them by default, illegibly. See `getStreamLabel`.
   */
  [streamShowLabelsPath]?: boolean;

  /**
   * Stream layer-label horizontal offset in px (Advanced; ECharts
   * `series.label.margin`), measured left of the ribbon's start — negative values
   * move the label onto the ribbon. This is the family's placement lever because
   * `label.position` is inert in ECharts 6.1.0; see `streamLabelMarginPath`.
   * Defaults to `STREAM_LABEL_MARGIN_DEFAULT` (`4`), so the key is omitted. Only
   * read when the labels are on. See `getStreamLabel`.
   */
  [streamLabelMarginPath]?: number;

  /**
   * Stream layer-label font size in px (Advanced; ECharts `series.label.fontSize`).
   * Unset keeps the themed label size. Only read when the labels are on. See
   * `getStreamLabel`.
   */
  [streamLabelFontSizePath]?: number;

  /**
   * Stream orthogonal ribbon padding as a percentage of the single axis' cross
   * extent (Advanced; ECharts `series.boundaryGap`, applied to both sides).
   * Defaults to `STREAM_BOUNDARY_GAP_PERCENT_DEFAULT` (`10`, ECharts' own default),
   * so the key is omitted. See `getStreamBoundaryGap`.
   */
  [streamBoundaryGapPath]?: number;

  /**
   * Stream ribbon opacity 0–100 (Advanced; ECharts `series.itemStyle.opacity`).
   * Unset leaves the ribbons fully opaque and writes no key. See
   * `getStreamItemStyle`.
   */
  [streamFillOpacityPath]?: number;

  /**
   * Stream ribbon border width in px (Advanced; ECharts
   * `series.itemStyle.borderWidth`). A border separates similarly-colored
   * neighbouring ribbons. `0` (the default) draws none. See `getStreamItemStyle`.
   */
  [streamBorderWidthPath]?: number;

  /**
   * Stream ribbon border color (Advanced; ECharts
   * `series.itemStyle.borderColor`), paired with the border width and only read
   * once a width is set. See `getStreamItemStyle`.
   */
  [streamBorderColorPath]?: string;

  /**
   * Stream hover emphasis (Advanced; ECharts `series.emphasis.focus`): fade the
   * other ribbons (`self`) or highlight the whole river (`series`). Defaults to
   * `STREAM_EMPHASIS_FOCUS_DEFAULT` (`none`), so the key is omitted. See
   * `getStreamEmphasis`.
   */
  [streamEmphasisFocusPath]?: StreamEmphasisFocus;

  /**
   * Animation toggle, shared by every family that offers it (cartesian and
   * part-to-whole both register it as an Advanced switch). Read via
   * `resolveAnimation`, which defaults it to **off** — see
   * `ANIMATION_ENABLED_DEFAULT` for why density thresholds were tried and
   * abandoned.
   * https://echarts.apache.org/en/option.html#animation
   */
  animation?: {
    enabled: boolean;
  };

  /**
   * Advanced-only performance overrides for the cartesian time-series fast path.
   * ECharts' big-data levers are auto-enabled above density thresholds; these
   * override the auto behavior. `showPoints` maps to per-series `showSymbol`
   * (Auto hides symbols once the chart's *total* point count is high) and
   * `downsampling` toggles LTTB
   * `sampling`. Unset fields resolve to their defaults (`auto` / `true`).
   * Animation is not here — it is the shared `animation.enabled` above. See
   * `lib/echarts/performance/resolvers.ts` and the `addPerformanceOptions`
   * editor fragment.
   */
  performance?: {
    showPoints?: PerformanceMode;
    downsampling?: boolean;
  };

  // @internal
  zLevel?: {
    // Each element with a defined zLevel is split out into a separate canvas (for performance reasons)
    // https://echarts.apache.org/en/option.html#series-line.zlevel
    series?: number;
    // Moves the y-axes onto a dedicated canvas so they can be captured in
    // isolation (the x-axis stays on the default/grid layer).
    axis?: number;
    grid?: number;
    legend?: number;
  };
}
