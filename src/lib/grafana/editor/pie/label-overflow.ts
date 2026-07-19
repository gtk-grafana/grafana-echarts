import { type PanelOptionsEditorBuilder, type SelectFieldConfigSettings } from '@grafana/data';
import {
  PIE_LABEL_OVERFLOW_DEFAULT,
  pieLabelOverflowOptions,
  pieLabelOverflowPath,
  pieLabelsCategoryName,
  pieLabelWidthPath,
} from 'editor/constants';
import { type PieLabelOverflow } from 'editor/types';
import { isAdvancedEditorMode } from 'lib/grafana/editor/common/editor-mode';
import { type PanelOptions } from 'types';

/**
 * Register the Advanced-only pie label "Overflow" select (ECharts
 * `label.overflow`) plus the paired "Label width" number input (ECharts
 * `label.width`). Long category names clip/overflow today; these let the label
 * truncate or wrap at a fixed width. Both live in the "Labels" category and are
 * gated behind Advanced; the width only shows once overflow handling is enabled.
 * The values thread through `getPieContentLabel` → `getPieLabelStyle`.
 */
export function addPieLabelOverflowOptions(builder: PanelOptionsEditorBuilder<PanelOptions>) {
  builder.addSelect<PieLabelOverflow, SelectFieldConfigSettings<PieLabelOverflow>>({
    path: pieLabelOverflowPath,
    name: 'Label overflow',
    category: [pieLabelsCategoryName],
    description: 'How long slice labels are handled: none, truncate (ellipsis), or wrap at the label width.',
    defaultValue: PIE_LABEL_OVERFLOW_DEFAULT,
    settings: {
      options: pieLabelOverflowOptions,
    },
    showIf: isAdvancedEditorMode,
  });

  builder.addNumberInput({
    path: pieLabelWidthPath,
    name: 'Label width',
    category: [pieLabelsCategoryName],
    description: 'Maximum label width (px) at which overflow handling applies.',
    settings: {
      min: 10,
      max: 400,
      integer: true,
    },
    showIf: (options) =>
      isAdvancedEditorMode(options) && options.labelOverflow != null && options.labelOverflow !== 'none',
  });
}
