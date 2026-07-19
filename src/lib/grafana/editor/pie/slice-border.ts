import { type PanelOptionsEditorBuilder } from '@grafana/data';
import {
  PIE_BORDER_WIDTH_DEFAULT,
  pieBorderColorPath,
  pieBorderWidthPath,
  pieTypeCategoryName,
} from 'editor/constants';
import { isAdvancedEditorMode } from 'lib/grafana/editor/common/editor-mode';
import { type PanelOptions } from 'types';

/**
 * Register the Advanced-only pie "Slice separation" controls: a border width
 * number input (ECharts `itemStyle.borderWidth`) plus a paired border color picker
 * (ECharts `itemStyle.borderColor`). A border between slices tells apart
 * similar-colored slices. Both live in the "Pie" category and are gated behind
 * Advanced; the color only shows once a width is set. Applied by `getPieItemStyle`.
 *
 * NOTE: `addColorPicker` is the first use in this repo; it is part of the standard
 * `PanelOptionsEditorBuilder` API (`@grafana/data`) and renders the Grafana color
 * picker (hex or theme token).
 */
export function addPieSliceBorderOptions(builder: PanelOptionsEditorBuilder<PanelOptions>) {
  builder.addNumberInput({
    path: pieBorderWidthPath,
    name: 'Slice border width',
    category: [pieTypeCategoryName],
    description: 'Width (px) of the border drawn between slices. 0 draws no border.',
    defaultValue: PIE_BORDER_WIDTH_DEFAULT,
    settings: {
      min: 0,
      max: 10,
      integer: true,
    },
    showIf: isAdvancedEditorMode,
  });

  builder.addColorPicker({
    path: pieBorderColorPath,
    name: 'Slice border color',
    category: [pieTypeCategoryName],
    description: 'Color of the border drawn between slices.',
    showIf: (options) => isAdvancedEditorMode(options) && (options.sliceBorderWidth ?? 0) > 0,
  });
}
