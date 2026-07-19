import { type PanelOptionsEditorBuilder } from '@grafana/data';
import {
  PIE_SELECTED_MODE_DEFAULT,
  pieSelectedModeOptions,
  pieSelectedModePath,
  pieSelectedOffsetPath,
  pieTypeCategoryName,
} from 'editor/constants';
import { isAdvancedEditorMode } from 'lib/grafana/editor/common/editor-mode';
import { type PanelOptions } from 'types';

/**
 * Register the Advanced "Select / explode" pie options: the ECharts
 * `series.selectedMode` (Off / Single / Multiple) plus the `series.selectedOffset`
 * explode distance. Both live in the plugin-owned "Pie" category and are gated
 * behind Advanced (`showIf: isAdvancedEditorMode`); the offset also hides unless a
 * selection mode is chosen. Rendered by `getPieSelection`.
 * https://echarts.apache.org/en/option.html#series-pie.selectedMode
 */
export function addPieSelectionOptions(builder: PanelOptionsEditorBuilder<PanelOptions>) {
  builder.addSelect({
    path: pieSelectedModePath,
    name: 'Slice selection',
    category: [pieTypeCategoryName],
    description: 'Allow selecting slices; a selected slice explodes outward by the offset below',
    defaultValue: PIE_SELECTED_MODE_DEFAULT,
    settings: {
      options: pieSelectedModeOptions,
    },
    showIf: isAdvancedEditorMode,
  });

  builder.addNumberInput({
    path: pieSelectedOffsetPath,
    name: 'Selected offset',
    category: [pieTypeCategoryName],
    description: 'How far (px) a selected slice is pushed outward',
    settings: {
      min: 0,
      max: 50,
    },
    showIf: (options) => isAdvancedEditorMode(options) && (options.selectedMode ?? PIE_SELECTED_MODE_DEFAULT) !== 'off',
  });
}
