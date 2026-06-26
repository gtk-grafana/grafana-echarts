import { OptionsWithLegend, OptionsWithTooltip } from '@grafana/schema';
import { seriesTypePath } from 'editor/series';
import { SeriesType } from 'editor/types';
import { HeatmapColorScheme } from 'echarts/options/heatmap';

export type { EChartsFieldConfig } from 'editor/types';

/**
 * `OptionsWithLegend` contributes the standard Core Grafana `legend`
 * (VizLegendOptions) config, registered via `commonOptionsBuilder.addLegendOptions`.
 *
 * `OptionsWithTooltip` contributes the standard `tooltip` (VizTooltipOptions:
 * mode, sort, hideZeros, maxWidth, maxHeight), registered via
 * `commonOptionsBuilder.addTooltipOptions`.
 *
 * `heatmapColorScheme` selects the color gradient used for the heatmap cell
 * layer (only relevant when a heatmap frame is present).
 */
export interface PanelOptions extends OptionsWithLegend, OptionsWithTooltip {
  [seriesTypePath]: SeriesType;
  heatmapColorScheme?: HeatmapColorScheme;
}
