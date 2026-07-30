import { type PanelOptionsEditorBuilder } from '@grafana/data';
import {
  STREAM_CHART_TYPE_DEFAULT,
  streamCategoryName,
  streamChartTypeOptions,
  streamChartTypePath,
} from 'editor/stream';
import { type PanelOptions } from 'types';

/**
 * Register the Default-tier stream "Chart type" radio (River / Bubble): which of the
 * family's two single-axis renders to draw over the same layers.
 *
 * Unlike every other multi-variant family this does **not** write the shared
 * panel-level `seriesType`. The bubble emits `scatter`, which `resolveChartModule`
 * already routes to the cartesian family, so a `seriesType: 'scatter'` stream panel
 * would render a cartesian scatter chart. The variant is family-local instead; see
 * `StreamChartType` for the full reasoning. Read by `streamChartModule.buildOption`.
 */
export function addStreamChartTypeOptions(builder: PanelOptionsEditorBuilder<PanelOptions>) {
  builder.addRadio({
    path: streamChartTypePath,
    name: 'Chart type',
    category: [streamCategoryName],
    description: 'River stacks the layers as ribbons; Bubble gives each layer its own row of value-sized dots',
    defaultValue: STREAM_CHART_TYPE_DEFAULT,
    settings: { options: streamChartTypeOptions },
  });
}
