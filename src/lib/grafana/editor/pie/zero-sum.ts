import { type PanelOptionsEditorBuilder } from '@grafana/data';
import {
  PIE_SHOW_EMPTY_CIRCLE_DEFAULT,
  PIE_STILL_SHOW_ZERO_SUM_DEFAULT,
  pieShowEmptyCirclePath,
  pieStillShowZeroSumPath,
  pieTypeCategoryName,
} from 'editor/constants';
import { isAdvancedEditorMode } from 'lib/grafana/editor/common/editor-mode';
import { type PanelOptions } from 'types';

/**
 * Register the Advanced "Zero-sum / empty" pie options: the ECharts
 * `series.stillShowZeroSum` (draw an even pie when every slice is 0) and
 * `series.showEmptyCircle` (draw a placeholder circle when there's no data).
 * Both live in the plugin-owned "Pie" category, gated behind Advanced
 * (`showIf: isAdvancedEditorMode`). Defaults match ECharts (`true`); only the
 * `false` override is emitted by `getPieEmptyState`.
 * https://echarts.apache.org/en/option.html#series-pie.stillShowZeroSum
 */
export function addPieZeroSumOptions(builder: PanelOptionsEditorBuilder<PanelOptions>) {
  builder.addBooleanSwitch({
    path: pieStillShowZeroSumPath,
    name: 'Still show zero sum',
    category: [pieTypeCategoryName],
    description: 'When every slice is zero, still draw an even pie instead of nothing',
    defaultValue: PIE_STILL_SHOW_ZERO_SUM_DEFAULT,
    showIf: isAdvancedEditorMode,
  });

  builder.addBooleanSwitch({
    path: pieShowEmptyCirclePath,
    name: 'Show empty circle',
    category: [pieTypeCategoryName],
    description: 'Draw a placeholder circle when there is no data',
    defaultValue: PIE_SHOW_EMPTY_CIRCLE_DEFAULT,
    showIf: isAdvancedEditorMode,
  });
}
