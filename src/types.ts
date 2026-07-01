import { OptionsWithLegend, TooltipDisplayMode } from '@grafana/schema';
import { seriesTypePath } from 'editor/constants';
import { SeriesType } from 'editor/types';
import { HeatmapColorScheme } from 'lib/echarts/options/heatmap';

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
 */
export interface PanelOptions extends OptionsWithLegend {
  [seriesTypePath]: SeriesType;
  tooltip?: { mode: TooltipDisplayMode };
  heatmapColorScheme?: HeatmapColorScheme;
}

