import { type ReduceDataOptions, type StandardOptionConfig } from '@grafana/data';
import { type OptionsWithLegend, type OptionsWithTooltip, type SortOrder } from '@grafana/schema';
import { type editorModePath, type seriesTypePath } from 'editor/constants';
import {
  type EditorMode,
  type PieChartType,
  type PieLabel,
  type PieLabelPosition,
  type PieRoseType,
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
