import { type PanelOptionsEditorBuilder } from '@grafana/data';
import { PARALLEL_LAYOUT_DEFAULT, parallelLayoutOptions, parallelLayoutPath } from 'editor/parallel';
import { isParallelSelected } from 'editor/radar';
import { addAdvancedRadio } from 'lib/grafana/editor/common/advanced-options';
import { type PanelOptions } from 'types';

/**
 * Register the Advanced parallel "Layout" radio (Horizontal / Vertical; ECharts
 * `parallel.layout`). Vertical stacks the axes top-to-bottom. Shown only when
 * parallel is the selected chart type. Rendered by `getParallelComponent`.
 */
export function addParallelLayoutOptions(builder: PanelOptionsEditorBuilder<PanelOptions>) {
  addAdvancedRadio(builder, {
    path: parallelLayoutPath,
    name: 'Layout',
    description: 'Axis orientation: horizontal (left-to-right) or vertical (top-to-bottom)',
    defaultValue: PARALLEL_LAYOUT_DEFAULT,
    settings: { options: parallelLayoutOptions },
    showIf: isParallelSelected,
  });
}
