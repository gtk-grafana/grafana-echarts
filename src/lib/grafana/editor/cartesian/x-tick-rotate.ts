import { type PanelOptionsEditorBuilder } from '@grafana/data';
import { CARTESIAN_X_TICK_ROTATE_DEFAULT, xTickRotatePath } from 'editor/cartesian';
import { addAdvancedNumberInput } from 'lib/grafana/editor/common/advanced-options';
import { type PanelOptions } from 'types';

/**
 * Register the Advanced cartesian "X tick rotation" input (degrees; ECharts
 * `xAxis.axisLabel.rotate`). Rotates x-axis tick labels so long category names
 * fit; 0 keeps them horizontal. Rendered by `getXTickRotate`.
 */
export function addCartesianXTickRotateOptions(builder: PanelOptionsEditorBuilder<PanelOptions>) {
  addAdvancedNumberInput(builder, {
    path: xTickRotatePath,
    name: 'X tick rotation',
    description: 'Rotate x-axis tick labels (degrees) so long labels fit. 0 keeps them horizontal.',
    defaultValue: CARTESIAN_X_TICK_ROTATE_DEFAULT,
    settings: { min: -90, max: 90, integer: true },
  });
}
