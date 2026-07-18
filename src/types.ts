import { type StandardOptionConfig } from '@grafana/data';
import { type OptionsWithLegend, type OptionsWithTooltip } from '@grafana/schema';
import { type seriesTypePath } from 'editor/constants';
import { type PieFormat, type SeriesTypeOption } from 'editor/types';

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
   * Pie (part-to-whole) frame shape: `wide` (each numeric field is a slice,
   * Grafana's default) or `long` (first string field is the category, rows
   * aggregated per category). Defaults to `PIE_FORMAT_DEFAULT` when unset.
   */
  pieFormat?: PieFormat;

  /**
   * Reducer id (`ReducerID`) that collapses each pie slice's values to a single
   * number — every numeric field in `wide` mode, each category group in `long`
   * mode. Defaults to `PIE_CALC_DEFAULT` (sum) when unset.
   */
  pieCalc?: string;

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
