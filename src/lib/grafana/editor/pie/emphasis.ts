import { type PanelOptionsEditorBuilder } from '@grafana/data';
import {
  PIE_EMPHASIS_FOCUS_DEFAULT,
  pieEmphasisFocusOptions,
  pieEmphasisFocusPath,
  pieEmphasisScalePath,
  pieTypeCategoryName,
} from 'editor/constants';
import { addAdvancedBooleanSwitch, addAdvancedSelect } from 'lib/grafana/editor/common/advanced-options';
import { type PanelOptions } from 'types';

/**
 * Register the Advanced "Emphasis" pie options in the "Pie" category: the ECharts
 * `emphasis.focus` (None / Self / Series) and `emphasis.scale` toggle governing
 * the slice hover state. Rendered by `getPieEmphasis`.
 */
export function addPieEmphasisOptions(builder: PanelOptionsEditorBuilder<PanelOptions>) {
  addAdvancedSelect(builder, {
    path: pieEmphasisFocusPath,
    name: 'Emphasis focus',
    category: pieTypeCategoryName,
    description: 'On hover, fade the other slices (Self) or highlight the whole series',
    defaultValue: PIE_EMPHASIS_FOCUS_DEFAULT,
    settings: { options: pieEmphasisFocusOptions },
  });

  addAdvancedBooleanSwitch(builder, {
    path: pieEmphasisScalePath,
    name: 'Emphasis scale',
    category: pieTypeCategoryName,
    description: 'Enlarge the hovered slice',
  });
}
