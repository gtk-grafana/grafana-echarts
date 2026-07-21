import { type PanelOptionsEditorBuilder } from '@grafana/data';
import { RADAR_LINE_WIDTH_DEFAULT, radarLineWidthPath } from 'editor/radar';
import { addAdvancedNumberInput } from 'lib/grafana/editor/common/advanced-options';
import { type PanelOptions } from 'types';

/**
 * Register the Advanced radar "Line width" input (px; ECharts
 * `series.lineStyle.width`). Empty uses ECharts' default stroke. Rendered by
 * `getRadarLineStyle`.
 */
export function addRadarLineWidthOptions(builder: PanelOptionsEditorBuilder<PanelOptions>) {
  addAdvancedNumberInput(builder, {
    path: radarLineWidthPath,
    name: 'Line width',
    description: 'Stroke width of the polygon outlines (px). Empty uses the default.',
    defaultValue: RADAR_LINE_WIDTH_DEFAULT,
    settings: { min: 0, max: 20, integer: true },
  });
}
