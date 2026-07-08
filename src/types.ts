import { type StandardOptionConfig } from '@grafana/data';
import { type TooltipDisplayMode, type VizLegendOptions } from '@grafana/schema';
import { type seriesTypePath } from 'editor/constants';
import { type SeriesType } from 'editor/types';

import { type HeatmapColorScheme } from 'lib/echarts/options/types';

export type { EChartsFieldConfig } from 'editor/types';

/**
 * `PanelLegendOptions` mirrors Core's `VizLegendOptions` but narrows `width` to a
 * plain pixel number. Core widened `width` to `number | string` (CSS px/%) in
 * grafana/grafana#126198, which this panel cannot honor: it sizes the legend and
 * the ECharts canvas in pixels and has no way to measure a CSS width. The
 * numeric width editor in `editor/legend` keeps provisioned values in sync with
 * this type.
 */
export type PanelLegendOptions = Omit<VizLegendOptions, 'width'> & { width?: number };

/**
 * `legend` contributes the standard Core Grafana legend config, registered via
 * `addLegendOptions` (see `editor/legend`).
 *
 * `tooltip.mode` selects the ECharts native tooltip trigger (Single -> item,
 * All -> axis, Hidden -> off); see `tooltipTriggerForMode`.
 *
 * `heatmapColorScheme` selects the color gradient used for the heatmap cell
 * layer (only relevant when a heatmap frame is present).
 *
 * @todo we probably want to build options around echarts API instead of using Grafana's
 */
export interface PanelOptions extends StandardOptionConfig {
  [seriesTypePath]: SeriesType;
  legend: PanelLegendOptions;
  tooltip?: { mode: TooltipDisplayMode };
  heatmapColorScheme?: HeatmapColorScheme;

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
