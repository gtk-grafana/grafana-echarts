import { type OptionsWithLegend, type TooltipDisplayMode } from '@grafana/schema';
import { type seriesTypePath } from 'editor/constants';
import { type SeriesType } from 'editor/types';

import { HeatmapColorScheme } from 'lib/echarts/options/types';

export type { EChartsFieldConfig } from 'editor/types';

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
export interface PanelOptions extends OptionsWithLegend {
  [seriesTypePath]: SeriesType;
  tooltip?: { mode: TooltipDisplayMode };
  heatmapColorScheme?: HeatmapColorScheme;

  // Not wired up to UI yet
  animation?: {
    // https://echarts.apache.org/en/option.html#animation
    enabled: boolean;
  };
}

