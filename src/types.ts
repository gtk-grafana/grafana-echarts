import { OptionsWithLegend } from '@grafana/schema';
import { seriesTypePath } from 'editor/series';
import { SeriesType } from 'editor/types';

/**
 * `OptionsWithLegend` contributes the standard Core Grafana `legend`
 * (VizLegendOptions) config, registered via `commonOptionsBuilder.addLegendOptions`.
 */
export interface PanelOptions extends OptionsWithLegend {
  [seriesTypePath]: SeriesType;
}
