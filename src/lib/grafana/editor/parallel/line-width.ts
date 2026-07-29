import { type PanelOptionsEditorBuilder } from '@grafana/data';
import { PARALLEL_LINE_WIDTH_DEFAULT, parallelLineWidthPath } from 'editor/parallel';
import { isParallelSelected } from 'editor/radar';
import { addAdvancedNumberInput } from 'lib/grafana/editor/common/advanced-options';
import { type PanelOptions } from 'types';

/**
 * Register the Advanced parallel "Line width" input (px; ECharts
 * `series.lineStyle.width`). Empty uses ECharts' default stroke. Shown only when
 * parallel is the selected chart type. Rendered by `getParallelLineStyle`.
 */
export function addParallelLineWidthOptions(builder: PanelOptionsEditorBuilder<PanelOptions>) {
  addAdvancedNumberInput(builder, {
    path: parallelLineWidthPath,
    name: 'Line width',
    description: 'Stroke width of the polylines (px). Empty uses the default.',
    defaultValue: PARALLEL_LINE_WIDTH_DEFAULT,
    settings: { min: 0, max: 20, integer: true },
    showIf: isParallelSelected,
  });
}
