import { type StandardOptionConfig } from '@grafana/data';
import { type OptionsWithLegend, type TooltipDisplayMode } from '@grafana/schema';
import { type seriesTypePath } from 'editor/constants';
import { type SeriesType } from 'editor/types';

import { type HeatmapColorScalePlacement, type HeatmapColorScheme, type HeatmapLayout } from 'lib/echarts/options/types';

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
export interface PanelOptions extends OptionsWithLegend, StandardOptionConfig {
  [seriesTypePath]: SeriesType;
  tooltip?: { mode: TooltipDisplayMode };
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
    axis?: number;
    grid?: number;
    legend?: number;
  };
}
