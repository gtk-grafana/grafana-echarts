import { type PanelOptionsEditorBuilder } from '@grafana/data';
import {
  PIE_BORDER_WIDTH_DEFAULT,
  pieBorderColorPath,
  pieBorderWidthPath,
  pieTypeCategoryName,
} from 'editor/constants';
import { addAdvancedColorPicker, addAdvancedNumberInput } from 'lib/grafana/editor/common/advanced-options';
import { type PanelOptions } from 'types';

/**
 * Register the Advanced pie "Slice separation" controls in the "Pie" category: a
 * border width (ECharts `itemStyle.borderWidth`) plus a paired border color
 * (ECharts `itemStyle.borderColor`) that only shows once a width is set. A border
 * between slices tells apart similar-colored slices. Applied by `getPieItemStyle`.
 */
export function addPieSliceBorderOptions(builder: PanelOptionsEditorBuilder<PanelOptions>) {
  addAdvancedNumberInput(builder, {
    path: pieBorderWidthPath,
    name: 'Slice border width',
    category: pieTypeCategoryName,
    description: 'Width (px) of the border drawn between slices. 0 draws no border.',
    defaultValue: PIE_BORDER_WIDTH_DEFAULT,
    settings: { min: 0, max: 10, integer: true },
  });

  addAdvancedColorPicker(builder, {
    path: pieBorderColorPath,
    name: 'Slice border color',
    category: pieTypeCategoryName,
    description: 'Color of the border drawn between slices.',
    showIf: (options) => (options.sliceBorderWidth ?? 0) > 0,
  });
}
