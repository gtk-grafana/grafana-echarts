import { type PanelOptionsEditorBuilder } from '@grafana/data';
import {
  PIE_SELECTED_MODE_DEFAULT,
  pieSelectedModeOptions,
  pieSelectedModePath,
  pieSelectedOffsetPath,
} from 'editor/pie';
import {
  addAdvancedNumberInput,
  addAdvancedSelect,
  composeShowIf,
  type ExtraShowIf,
} from 'lib/grafana/editor/common/advanced-options';
import { type PanelOptions } from 'types';

/**
 * Register the Advanced "Select / explode" pie options in the "Advanced" category: the
 * ECharts `series.selectedMode` (Off / Single / Multiple) plus the
 * `series.selectedOffset` explode distance, which only shows once a selection mode
 * is chosen. Rendered by `getPieSelection`.
 */
export function addPieSelectionOptions(builder: PanelOptionsEditorBuilder<PanelOptions>, showIf?: ExtraShowIf) {
  addAdvancedSelect(builder, {
    path: pieSelectedModePath,
    name: 'Slice selection',
    description: 'Allow selecting slices; a selected slice explodes outward by the offset below',
    defaultValue: PIE_SELECTED_MODE_DEFAULT,
    settings: { options: pieSelectedModeOptions },
    showIf,
  });

  addAdvancedNumberInput(builder, {
    path: pieSelectedOffsetPath,
    name: 'Selected offset',
    description: 'How far (px) a selected slice is pushed outward',
    settings: { min: 0, max: 50 },
    showIf: composeShowIf(showIf, (options) => (options.selectedMode ?? PIE_SELECTED_MODE_DEFAULT) !== 'off'),
  });
}
