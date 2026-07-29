import { type PanelOptionsEditorBuilder } from '@grafana/data';
import {
  PIE_EMPHASIS_FOCUS_DEFAULT,
  PIE_EMPHASIS_SCALE_DEFAULT,
  pieEmphasisFocusOptions,
  pieEmphasisFocusPath,
  pieEmphasisScalePath,
} from 'editor/pie';
import {
  addAdvancedBooleanSwitch,
  addAdvancedSelect,
  type ExtraShowIf,
} from 'lib/grafana/editor/common/advanced-options';
import { type PanelOptions } from 'types';

/**
 * Register the Advanced "Emphasis" pie options in the "Advanced" category: the ECharts
 * `emphasis.focus` (None / Self / Series) and `emphasis.scale` toggle governing
 * the slice hover state. Rendered by `getPieEmphasis`.
 */
export function addPieEmphasisOptions(builder: PanelOptionsEditorBuilder<PanelOptions>, showIf?: ExtraShowIf) {
  addAdvancedSelect(builder, {
    path: pieEmphasisFocusPath,
    name: 'Emphasis focus',
    description: 'On hover, fade the other slices (Self) or highlight the whole series',
    defaultValue: PIE_EMPHASIS_FOCUS_DEFAULT,
    settings: { options: pieEmphasisFocusOptions },
    showIf,
  });

  addAdvancedBooleanSwitch(builder, {
    path: pieEmphasisScalePath,
    name: 'Emphasis scale',
    description: 'Enlarge the hovered slice',
    // On by default so the switch state matches ECharts' own hover behavior
    // (the hovered slice enlarges); turning it off disables the enlarge.
    defaultValue: PIE_EMPHASIS_SCALE_DEFAULT,
    showIf,
  });
}
