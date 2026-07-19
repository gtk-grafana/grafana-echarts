import { type PanelOptionsEditorBuilder } from '@grafana/data';
import { PIE_MIN_SHOW_LABEL_ANGLE_DEFAULT, pieLabelsCategoryName, pieMinShowLabelAnglePath } from 'editor/constants';
import { isAdvancedEditorMode } from 'lib/grafana/editor/common/editor-mode';
import { type PanelOptions } from 'types';

/**
 * Register the Advanced-only pie "Min angle to show label" number input (ECharts
 * `series.minShowLabelAngle`). Hides labels on slices whose central angle is below
 * the given degrees, decluttering many-slice pies. Placed in the "Labels" category
 * and gated behind Advanced. `0` (the default) shows every label. Applied by
 * `getPieMinShowLabelAngle`.
 */
export function addPieMinShowLabelAngleOptions(builder: PanelOptionsEditorBuilder<PanelOptions>) {
  builder.addNumberInput({
    path: pieMinShowLabelAnglePath,
    name: 'Min angle to show label',
    category: [pieLabelsCategoryName],
    description: 'Hide labels on slices smaller than this angle (degrees). 0 shows all labels.',
    defaultValue: PIE_MIN_SHOW_LABEL_ANGLE_DEFAULT,
    settings: {
      min: 0,
      max: 45,
    },
    showIf: isAdvancedEditorMode,
  });
}
