import { type ReduceDataOptions, type StandardOptionConfig } from '@grafana/data';
import {
  type OptionsWithLegend,
  type OptionsWithTooltip,
  type SortOrder,
  type VizLegendOptions,
} from '@grafana/schema';
import { type editorModePath, type seriesTypePath } from 'editor/constants';
import {
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
  type PieSelectedMode,
  type SeriesTypeOption,
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

  // @internal
  animation?: {
    // https://echarts.apache.org/en/option.html#animation
    enabled: boolean;
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
