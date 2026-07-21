import { type PanelOptionsEditorBuilder } from '@grafana/data';
import { CARTESIAN_POINT_SIZE_DEFAULT, pointSizePath } from 'editor/cartesian';
import { addAdvancedNumberInput } from 'lib/grafana/editor/common/advanced-options';
import { type PanelOptions } from 'types';

/**
 * Register the Advanced cartesian "Point size" input (px; ECharts `symbolSize`).
 * `0` hides the points; empty uses ECharts' default symbol. Affects line/scatter
 * series. Rendered by `getCartesianSymbol`.
 */
export function addCartesianPointSizeOptions(builder: PanelOptionsEditorBuilder<PanelOptions>) {
  addAdvancedNumberInput(builder, {
    path: pointSizePath,
    name: 'Point size',
    description: 'Marker size for line/scatter points (px). 0 hides the points.',
    defaultValue: CARTESIAN_POINT_SIZE_DEFAULT,
    settings: { min: 0, max: 40, integer: true },
  });
}
