import { type PanelOptionsEditorBuilder } from '@grafana/data';
import { PIE_LABEL_FONT_SIZE_DEFAULT, pieLabelFontSizePath, pieLabelsCategoryName } from 'editor/constants';
import { isAdvancedEditorMode } from 'lib/grafana/editor/common/editor-mode';
import { type PanelOptions } from 'types';

/**
 * Register the Advanced-only pie "Label font size" number input (ECharts
 * `label.fontSize`). Slice labels use the theme font size today; this overrides
 * it. Placed in the plugin-owned "Labels" category and gated behind Advanced. The
 * value threads through `getPieContentLabel` → `getPieLabelStyle`; unset keeps the
 * theme size.
 */
export function addPieLabelFontSizeOptions(builder: PanelOptionsEditorBuilder<PanelOptions>) {
  builder.addNumberInput({
    path: pieLabelFontSizePath,
    name: 'Label font size',
    category: [pieLabelsCategoryName],
    description: 'Font size (px) for the slice labels. Leave empty to use the theme default.',
    defaultValue: PIE_LABEL_FONT_SIZE_DEFAULT,
    settings: {
      min: 6,
      max: 48,
      integer: true,
    },
    showIf: isAdvancedEditorMode,
  });
}
