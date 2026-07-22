import { type PanelOptionsEditorBuilder } from '@grafana/data';
import { isRadarSelected, RADAR_SHAPE_DEFAULT, radarShapeOptions, radarShapePath } from 'editor/radar';
import { addAdvancedRadio } from 'lib/grafana/editor/common/advanced-options';
import { type PanelOptions } from 'types';

/**
 * Register the Advanced radar "Shape" radio (Polygon / Circle; ECharts
 * `radar.shape`). Circle draws a smooth ring grid instead of straight edges.
 * Rendered by `getRadarComponent`.
 */
export function addRadarShapeOptions(builder: PanelOptionsEditorBuilder<PanelOptions>) {
  addAdvancedRadio(builder, {
    path: radarShapePath,
    name: 'Shape',
    description: 'Radar grid shape: polygon (straight edges) or circle',
    defaultValue: RADAR_SHAPE_DEFAULT,
    settings: { options: radarShapeOptions },
    showIf: isRadarSelected,
  });
}
