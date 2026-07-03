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
 */
export interface PanelOptions extends OptionsWithLegend {
  [seriesTypePath]: SeriesType;
  tooltip?: { mode: TooltipDisplayMode };
  heatmapColorScheme?: HeatmapColorScheme;
  // Panel-level default for stacking bar series (only meaningful when the panel
  // series type is `bar`). Per-field overrides win; see EChartsFieldConfig.
  stackSeries?: boolean;
}

