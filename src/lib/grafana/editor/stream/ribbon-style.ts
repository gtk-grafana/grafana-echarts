import { type PanelOptionsEditorBuilder } from '@grafana/data';
import {
  isStreamRiverSelected,
  STREAM_BORDER_WIDTH_DEFAULT,
  STREAM_FILL_OPACITY_DEFAULT,
  streamBorderColorPath,
  streamBorderWidthPath,
  streamFillOpacityPath,
} from 'editor/stream';
import { addAdvancedColorPicker, addAdvancedNumberInput } from 'lib/grafana/editor/common/advanced-options';
import { type PanelOptions } from 'types';

/**
 * Register the Advanced stream ribbon-style options: a fill opacity (ECharts
 * `series.itemStyle.opacity`) and a border width with its paired color (ECharts
 * `series.itemStyle.borderWidth` / `borderColor`), the color appearing only once a
 * width is set — the `addPieSliceBorderOptions` shape.
 *
 * A border tells apart two similarly-colored neighbouring ribbons, which a stacked
 * river makes easy to confuse. Rendered by `getStreamItemStyle`, which omits the
 * whole `itemStyle` key when neither is configured.
 *
 * River-only: these name and style a *ribbon*. The bubble variant's symbols take the
 * layer color directly and are sized by "Max bubble size".
 */
export function addStreamRibbonStyleOptions(builder: PanelOptionsEditorBuilder<PanelOptions>) {
  addAdvancedNumberInput(builder, {
    path: streamFillOpacityPath,
    name: 'Ribbon opacity',
    description: 'Opacity of the ribbon fill (0–100). Empty is fully opaque.',
    defaultValue: STREAM_FILL_OPACITY_DEFAULT,
    settings: { min: 0, max: 100, integer: true },
    showIf: isStreamRiverSelected,
  });

  addAdvancedNumberInput(builder, {
    path: streamBorderWidthPath,
    name: 'Ribbon border width',
    description: 'Width (px) of the border drawn around each ribbon. 0 draws no border.',
    defaultValue: STREAM_BORDER_WIDTH_DEFAULT,
    settings: { min: 0, max: 10, integer: true },
    showIf: isStreamRiverSelected,
  });

  addAdvancedColorPicker(builder, {
    path: streamBorderColorPath,
    name: 'Ribbon border color',
    description: 'Color of the border drawn around each ribbon.',
    showIf: (options) =>
      isStreamRiverSelected(options) && (options.streamBorderWidth ?? STREAM_BORDER_WIDTH_DEFAULT) > 0,
  });
}
