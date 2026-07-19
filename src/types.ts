import { type ReduceDataOptions, type StandardOptionConfig } from '@grafana/data';
import { type OptionsWithLegend, type OptionsWithTooltip, type SortOrder } from '@grafana/schema';
import { type editorModePath, type seriesTypePath } from 'editor/constants';
import {
  type EditorMode,
  type PieChartType,
  type PieEmphasisFocus,
  type PieLabel,
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
   * Pie (part-to-whole) slice-label content (Grafana Pie chart "Labels" parity):
   * which of Name / Value / Percent render on each slice. Empty/unset hides the
   * labels (matching core). See `getPieContentLabel`.
   */
  displayLabels?: PieLabel[];

  /**
   * Pie (part-to-whole) slice sorting (Grafana Pie chart "Slice sorting" parity):
   * order slices by value — `desc` (largest first), `asc` (smallest first), or
   * `none` (data order). Defaults to `PIE_SORT_DEFAULT` (`desc`) when unset. Sorts
   * the shared slice model so chart, legend, and tooltip agree. See `resolvePieSlices`.
   */
  sort?: SortOrder;

  /**
   * Pie (part-to-whole) slice-selection mode (Advanced): `off` / `single` /
   * `multiple`. A selected slice explodes outward by `selectedOffset`. Omits its
   * key at the `off` default. See `getPieSelection`.
   * https://echarts.apache.org/en/option.html#series-pie.selectedMode
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
   * https://echarts.apache.org/en/option.html#series-pie.itemStyle.borderRadius
   */
  sliceBorderRadius?: number;

  /**
   * Pie (part-to-whole) hover emphasis focus (Advanced): `none` (default) / `self`
   * / `series`. Omits its key at the `none` default. See `getPieEmphasis`.
   * https://echarts.apache.org/en/option.html#series-pie.emphasis.focus
   */
  emphasisFocus?: PieEmphasisFocus;

  /**
   * Pie (part-to-whole) hover emphasis scale (Advanced): whether the hovered slice
   * enlarges. Unset omits the key (ECharts default enlarges). See `getPieEmphasis`.
   * https://echarts.apache.org/en/option.html#series-pie.emphasis.scale
   */
  emphasisScale?: boolean;

  /**
   * Pie (part-to-whole) slice-label color (Advanced): overrides the theme text
   * color used by `getPieLabelStyle`. Unset keeps the theme color. See
   * `getPieContentLabel`.
   * https://echarts.apache.org/en/option.html#series-pie.label.color
   */
  labelColor?: string;

  /**
   * Pie (part-to-whole) zero-sum rendering (Advanced): when every slice is 0,
   * still draw an even pie (`stillShowZeroSum`). ECharts default is `true`; only
   * the `false` override is emitted. See `getPieEmptyState`.
   * https://echarts.apache.org/en/option.html#series-pie.stillShowZeroSum
   */
  stillShowZeroSum?: boolean;

  /**
   * Pie (part-to-whole) empty-circle rendering (Advanced): draw a placeholder
   * circle when there's no data. ECharts default is `true`; only the `false`
   * override is emitted. See `getPieEmptyState`.
   * https://echarts.apache.org/en/option.html#series-pie.showEmptyCircle
   */
  showEmptyCircle?: boolean;

  /**
   * Pie (part-to-whole) slice direction (Advanced): lay slices out clockwise.
   * ECharts default is `true`; only the `false` override is emitted. See
   * `getPieOrientation`.
   * https://echarts.apache.org/en/option.html#series-pie.clockwise
   */
  clockwise?: boolean;

  /**
   * Pie (part-to-whole) label de-clutter (Advanced): adjust label positions to
   * avoid overlap. ECharts default is `true`; only the `false` override is
   * emitted. See `getPieOrientation`.
   * https://echarts.apache.org/en/option.html#series-pie.avoidLabelOverlap
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
