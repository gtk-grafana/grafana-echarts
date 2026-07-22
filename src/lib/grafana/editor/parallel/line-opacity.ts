import { type PanelOptionsEditorBuilder } from '@grafana/data';
import { PARALLEL_LINE_OPACITY_DEFAULT, parallelLineOpacityPath } from 'editor/parallel';
import { isParallelSelected } from 'editor/radar';
import { addAdvancedNumberInput } from 'lib/grafana/editor/common/advanced-options';
import { type PanelOptions } from 'types';

/**
 * Register the Advanced parallel "Line opacity" input (0–100; ECharts
 * `series.lineStyle.opacity`). Lowering it de-clutters dense line bundles. Empty
 * uses ECharts' default. Shown only when parallel is the selected chart type.
 * Rendered by `getParallelLineStyle`.
 */
export function addParallelLineOpacityOptions(builder: PanelOptionsEditorBuilder<PanelOptions>) {
  addAdvancedNumberInput(builder, {
    path: parallelLineOpacityPath,
    name: 'Line opacity',
    description: 'Opacity of the polylines (0–100). Empty uses the default.',
    defaultValue: PARALLEL_LINE_OPACITY_DEFAULT,
    settings: { min: 0, max: 100, integer: true },
    showIf: isParallelSelected,
  });
}
