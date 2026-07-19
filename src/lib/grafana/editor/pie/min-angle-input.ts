import { type PanelOptionsEditorBuilder } from '@grafana/data';
import { PIE_MIN_ANGLE_DEFAULT, pieMinAnglePath, pieTypeCategoryName } from 'editor/constants';
import { isAdvancedEditorMode } from 'lib/grafana/editor/common/editor-mode';
import { type PanelOptions } from 'types';

/**
 * Register the pie "Min slice angle" number input (degrees) — an ECharts-only
 * extra, so it is gated behind Advanced (`showIf: isAdvancedEditorMode`) and
 * placed in the plugin-owned "Pie" category alongside the chart type. The value
 * enlarges tiny long-tail slices to at least this angle so they stay visible and
 * clickable; `0` (the default) is omitted from the series. See `getPieMinAngle`.
 */
export function addPieMinAngleOptions(builder: PanelOptionsEditorBuilder<PanelOptions>) {
  builder.addNumberInput({
    path: pieMinAnglePath,
    name: 'Min slice angle',
    category: [pieTypeCategoryName],
    description: 'Minimum angle (degrees) for a slice, so small slices stay visible',
    defaultValue: PIE_MIN_ANGLE_DEFAULT,
    settings: { min: 0, max: 45, integer: false, placeholder: '0' },
    showIf: isAdvancedEditorMode,
  });
}
