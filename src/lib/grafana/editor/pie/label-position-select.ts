import { type PanelOptionsEditorBuilder } from '@grafana/data';
import {
  PIE_LABEL_POSITION_DEFAULT,
  pieLabelPositionOptions,
  pieLabelPositionPath,
  pieLabelsCategoryName,
} from 'editor/constants';
import { isAdvancedEditorMode } from 'lib/grafana/editor/common/editor-mode';
import { type PanelOptions } from 'types';

/**
 * Register the pie "Label position" radio (Outside / Inside / Center) — an
 * ECharts-only, Advanced-gated option (no core Pie chart equivalent). Placed in
 * the plugin-owned "Labels" category alongside the label-content multi-select.
 * The value threads into `getPieContentLabel` as the ECharts `label.position`:
 * `outside` draws leader lines (the default), `inside` places labels on the
 * slices, and `center` puts a single readout in the donut hole. Hidden in Default
 * mode via `showIf: isAdvancedEditorMode`.
 */
export function addPieLabelPositionOptions(builder: PanelOptionsEditorBuilder<PanelOptions>) {
  builder.addRadio({
    path: pieLabelPositionPath,
    name: 'Label position',
    category: [pieLabelsCategoryName],
    description: 'Where slice labels render: outside, inside the slice, or the donut center',
    defaultValue: PIE_LABEL_POSITION_DEFAULT,
    settings: {
      options: pieLabelPositionOptions,
    },
    showIf: isAdvancedEditorMode,
  });
}
