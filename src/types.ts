import { OptionsWithLegend, OptionsWithTooltip } from '@grafana/schema';
import { seriesTypePath } from 'editor/series';
import { SeriesType } from 'editor/types';

/**
 * `OptionsWithLegend` contributes the standard Core Grafana `legend`
 * (VizLegendOptions) config, registered via `commonOptionsBuilder.addLegendOptions`.
 *
 * `OptionsWithTooltip` contributes the standard `tooltip` (VizTooltipOptions:
 * mode, sort, hideZeros, maxWidth, maxHeight), registered via
 * `commonOptionsBuilder.addTooltipOptions`.
 */
export interface PanelOptions extends OptionsWithLegend, OptionsWithTooltip {
  [seriesTypePath]: SeriesType;
}
