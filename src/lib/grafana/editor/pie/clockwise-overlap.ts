import { type PanelOptionsEditorBuilder } from '@grafana/data';
import {
  PIE_AVOID_LABEL_OVERLAP_DEFAULT,
  PIE_CLOCKWISE_DEFAULT,
  pieAvoidLabelOverlapPath,
  pieClockwisePath,
  pieTypeCategoryName,
} from 'editor/constants';
import { isAdvancedEditorMode } from 'lib/grafana/editor/common/editor-mode';
import { type PanelOptions } from 'types';

/**
 * Register the Advanced "Clockwise / avoid overlap" pie options: the ECharts
 * `series.clockwise` (slice layout direction) and `series.avoidLabelOverlap`
 * (nudge labels apart). Both live in the plugin-owned "Pie" category, gated
 * behind Advanced (`showIf: isAdvancedEditorMode`). Defaults match ECharts
 * (`true`); only the `false` override is emitted by `getPieOrientation`.
 * https://echarts.apache.org/en/option.html#series-pie.clockwise
 */
export function addPieClockwiseOverlapOptions(builder: PanelOptionsEditorBuilder<PanelOptions>) {
  builder.addBooleanSwitch({
    path: pieClockwisePath,
    name: 'Clockwise',
    category: [pieTypeCategoryName],
    description: 'Lay slices out clockwise (off = counter-clockwise)',
    defaultValue: PIE_CLOCKWISE_DEFAULT,
    showIf: isAdvancedEditorMode,
  });

  builder.addBooleanSwitch({
    path: pieAvoidLabelOverlapPath,
    name: 'Avoid label overlap',
    category: [pieTypeCategoryName],
    description: 'Adjust label positions to keep them from overlapping',
    defaultValue: PIE_AVOID_LABEL_OVERLAP_DEFAULT,
    showIf: isAdvancedEditorMode,
  });
}
