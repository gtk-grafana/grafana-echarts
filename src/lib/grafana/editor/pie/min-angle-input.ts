import { type PanelOptionsEditorBuilder } from '@grafana/data';
import { PIE_MIN_ANGLE_DEFAULT, pieMinAnglePath } from 'editor/constants';
import { addAdvancedNumberInput } from 'lib/grafana/editor/common/advanced-options';
import { type PanelOptions } from 'types';

/**
 * Register the pie "Min slice angle" number input (degrees) — an ECharts-only
 * extra in the "Advanced" category. Enlarges tiny long-tail slices to at
 * least this angle so they stay visible and clickable; `0` (the default) is
 * omitted from the series. See `getPieMinAngle`.
 */
export function addPieMinAngleOptions(builder: PanelOptionsEditorBuilder<PanelOptions>) {
  addAdvancedNumberInput(builder, {
    path: pieMinAnglePath,
    name: 'Min slice angle',
    description: 'Minimum angle (degrees) for a slice, so small slices stay visible',
    defaultValue: PIE_MIN_ANGLE_DEFAULT,
    settings: { min: 0, max: 45, integer: false, placeholder: '0' },
  });
}
