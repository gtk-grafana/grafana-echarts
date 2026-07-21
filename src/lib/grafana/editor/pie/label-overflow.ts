import { type PanelOptionsEditorBuilder } from '@grafana/data';
import {
  PIE_LABEL_OVERFLOW_DEFAULT,
  pieLabelOverflowOptions,
  pieLabelOverflowPath,
  pieLabelWidthPath,
} from 'editor/constants';
import { addAdvancedNumberInput, addAdvancedSelect } from 'lib/grafana/editor/common/advanced-options';
import { type PanelOptions } from 'types';

/**
 * Register the Advanced pie label "Overflow" select (ECharts `label.overflow`)
 * plus the paired "Label width" number input (ECharts `label.width`) in the
 * "Advanced" category. These let long labels truncate or wrap at a fixed width; the
 * width only shows once overflow handling is enabled. Both thread through
 * `getPieContentLabel` → `getPieLabelStyle`.
 */
export function addPieLabelOverflowOptions(builder: PanelOptionsEditorBuilder<PanelOptions>) {
  addAdvancedSelect(builder, {
    path: pieLabelOverflowPath,
    name: 'Label overflow',
    description: 'How long slice labels are handled: none, truncate (ellipsis), or wrap at the label width.',
    defaultValue: PIE_LABEL_OVERFLOW_DEFAULT,
    settings: { options: pieLabelOverflowOptions },
  });

  addAdvancedNumberInput(builder, {
    path: pieLabelWidthPath,
    name: 'Label width',
    description: 'Maximum label width (px) at which overflow handling applies.',
    settings: { min: 10, max: 400, integer: true },
    showIf: (options) => options.labelOverflow != null && options.labelOverflow !== 'none',
  });
}
