import { type PanelOptionsEditorBuilder } from '@grafana/data';
import { CARTESIAN_FILL_OPACITY_DEFAULT, fillOpacityPath } from 'editor/cartesian';
import { addAdvancedNumberInput } from 'lib/grafana/editor/common/advanced-options';
import { type PanelOptions } from 'types';

/**
 * Register the Advanced cartesian "Fill opacity" input (0–100; ECharts
 * `areaStyle.opacity`). A non-zero value turns a `line` series into an area
 * chart; 0 is a plain line. Rendered by `getCartesianAreaStyle`.
 */
export function addCartesianFillOpacityOptions(builder: PanelOptionsEditorBuilder<PanelOptions>) {
  addAdvancedNumberInput(builder, {
    path: fillOpacityPath,
    name: 'Fill opacity',
    description: 'Fill the area under line series (0–100). 0 is a plain line.',
    defaultValue: CARTESIAN_FILL_OPACITY_DEFAULT,
    settings: { min: 0, max: 100, integer: true },
  });
}
