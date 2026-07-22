import { type PanelOptionsEditorBuilder } from '@grafana/data';
import { PARALLEL_SMOOTH_DEFAULT, parallelCategoryName, parallelSmoothPath } from 'editor/parallel';
import { isParallelSelected } from 'editor/radar';
import { type PanelOptions } from 'types';

/**
 * Register the Default-tier parallel "Smooth" switch (ECharts `series.smooth`):
 * curve each polyline through its axis crossings rather than drawing straight
 * segments. Shown only when parallel is the selected chart type. Rendered by
 * `buildParallelOption`.
 */
export function addParallelSmoothOptions(builder: PanelOptionsEditorBuilder<PanelOptions>) {
  builder.addBooleanSwitch({
    path: parallelSmoothPath,
    name: 'Smooth',
    category: [parallelCategoryName],
    description: 'Curve each polyline through its axis crossings',
    defaultValue: PARALLEL_SMOOTH_DEFAULT,
    showIf: isParallelSelected,
  });
}
