import { type PanelOptionsEditorBuilder } from '@grafana/data';
import { barRadiusPath, CARTESIAN_BAR_RADIUS_DEFAULT } from 'editor/cartesian';
import { addAdvancedNumberInput } from 'lib/grafana/editor/common/advanced-options';
import { type PanelOptions } from 'types';

/**
 * Register the Advanced cartesian "Bar corner radius" input (px; ECharts
 * `itemStyle.borderRadius`). Only affects `bar` series; 0 draws square corners.
 * Rendered by `getCartesianItemStyle`.
 */
export function addCartesianBarRadiusOptions(builder: PanelOptionsEditorBuilder<PanelOptions>) {
  addAdvancedNumberInput(builder, {
    path: barRadiusPath,
    name: 'Bar corner radius',
    description: 'Round the corners of bars (px). 0 draws square corners.',
    defaultValue: CARTESIAN_BAR_RADIUS_DEFAULT,
    settings: { min: 0, max: 50, integer: true },
  });
}
