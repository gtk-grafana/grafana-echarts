import { type PanelOptionsEditorBuilder } from '@grafana/data';
import { RADAR_SPLIT_NUMBER_DEFAULT, radarSplitNumberPath } from 'editor/radar';
import { addAdvancedNumberInput } from 'lib/grafana/editor/common/advanced-options';
import { type PanelOptions } from 'types';

/**
 * Register the Advanced radar "Rings" input (ECharts `radar.splitNumber`): the
 * number of concentric grid rings. Empty uses ECharts' default (5). Rendered by
 * `getRadarComponent`.
 */
export function addRadarSplitNumberOptions(builder: PanelOptionsEditorBuilder<PanelOptions>) {
  addAdvancedNumberInput(builder, {
    path: radarSplitNumberPath,
    name: 'Rings',
    description: 'Number of concentric grid rings. Empty uses the default.',
    defaultValue: RADAR_SPLIT_NUMBER_DEFAULT,
    settings: { min: 1, max: 20, integer: true },
  });
}
