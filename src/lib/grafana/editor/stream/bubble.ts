import { type PanelOptionsEditorBuilder } from '@grafana/data';
import { isStreamBubbleSelected, STREAM_BUBBLE_MAX_SIZE_DEFAULT, streamBubbleMaxSizePath } from 'editor/stream';
import { addAdvancedNumberInput } from 'lib/grafana/editor/common/advanced-options';
import { type PanelOptions } from 'types';

/**
 * Register the Advanced bubble "Max bubble size" input (ECharts
 * `series-scatter.symbolSize`): the diameter the largest value in the layer set
 * draws at. Everything else scales down from it by **area**, so this is the one
 * knob that trades legibility against crowding — raise it on a sparse series, lower
 * it when neighbouring bubbles start to collide.
 *
 * Shown only when the bubble variant is selected. Rendered by
 * `resolveBubbleSymbolSize`.
 */
export function addStreamBubbleOptions(builder: PanelOptionsEditorBuilder<PanelOptions>) {
  addAdvancedNumberInput(builder, {
    path: streamBubbleMaxSizePath,
    name: 'Max bubble size',
    description: 'Diameter (px) of the largest value. Smaller values scale down by area.',
    defaultValue: STREAM_BUBBLE_MAX_SIZE_DEFAULT,
    settings: { min: 2, max: 60, integer: true },
    showIf: isStreamBubbleSelected,
  });
}
