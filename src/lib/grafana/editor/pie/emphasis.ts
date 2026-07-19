import { type PanelOptionsEditorBuilder } from '@grafana/data';
import {
  PIE_EMPHASIS_FOCUS_DEFAULT,
  pieEmphasisFocusOptions,
  pieEmphasisFocusPath,
  pieEmphasisScalePath,
  pieTypeCategoryName,
} from 'editor/constants';
import { isAdvancedEditorMode } from 'lib/grafana/editor/common/editor-mode';
import { type PanelOptions } from 'types';

/**
 * Register the Advanced "Emphasis" pie options: the ECharts `emphasis.focus`
 * (None / Self / Series) and `emphasis.scale` toggle governing the slice hover
 * state. Both live in the plugin-owned "Pie" category, gated behind Advanced
 * (`showIf: isAdvancedEditorMode`). Rendered by `getPieEmphasis`.
 * https://echarts.apache.org/en/option.html#series-pie.emphasis
 */
export function addPieEmphasisOptions(builder: PanelOptionsEditorBuilder<PanelOptions>) {
  builder.addSelect({
    path: pieEmphasisFocusPath,
    name: 'Emphasis focus',
    category: [pieTypeCategoryName],
    description: 'On hover, fade the other slices (Self) or highlight the whole series',
    defaultValue: PIE_EMPHASIS_FOCUS_DEFAULT,
    settings: {
      options: pieEmphasisFocusOptions,
    },
    showIf: isAdvancedEditorMode,
  });

  builder.addBooleanSwitch({
    path: pieEmphasisScalePath,
    name: 'Emphasis scale',
    category: [pieTypeCategoryName],
    description: 'Enlarge the hovered slice',
    showIf: isAdvancedEditorMode,
  });
}
