import { type PanelOptionsEditorBuilder } from '@grafana/data';
import { PIE_LABEL_FONT_SIZE_DEFAULT, pieLabelFontSizePath } from 'editor/pie';
import { addAdvancedNumberInput, type ExtraShowIf } from 'lib/grafana/editor/common/advanced-options';
import { type PanelOptions } from 'types';

/**
 * Register the Advanced pie "Label font size" number input (ECharts
 * `label.fontSize`) in the "Advanced" category. Slice labels use the
 * theme font size by default; this overrides it via `getPieContentLabel` →
 * `getPieLabelStyle`. Unset keeps the theme size.
 */
export function addPieLabelFontSizeOptions(builder: PanelOptionsEditorBuilder<PanelOptions>, showIf?: ExtraShowIf) {
  addAdvancedNumberInput(builder, {
    path: pieLabelFontSizePath,
    name: 'Label font size',
    description: 'Font size (px) for the slice labels. Leave empty to use the theme default.',
    defaultValue: PIE_LABEL_FONT_SIZE_DEFAULT,
    settings: { min: 6, max: 48, integer: true },
    showIf,
  });
}
