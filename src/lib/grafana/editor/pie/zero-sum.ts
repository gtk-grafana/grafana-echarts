import { type PanelOptionsEditorBuilder } from '@grafana/data';
import {
  PIE_SHOW_EMPTY_CIRCLE_DEFAULT,
  PIE_STILL_SHOW_ZERO_SUM_DEFAULT,
  pieShowEmptyCirclePath,
  pieStillShowZeroSumPath,
} from 'editor/pie';
import { addAdvancedBooleanSwitch, type ExtraShowIf } from 'lib/grafana/editor/common/advanced-options';
import { type PanelOptions } from 'types';

/**
 * Register the Advanced "Zero-sum / empty" pie options in the "Advanced" category: the
 * ECharts `series.stillShowZeroSum` (draw an even pie when every slice is 0) and
 * `series.showEmptyCircle` (draw a placeholder circle when there's no data).
 * Defaults match ECharts (`true`); only the `false` override is emitted by
 * `getPieEmptyState`.
 */
export function addPieZeroSumOptions(builder: PanelOptionsEditorBuilder<PanelOptions>, showIf?: ExtraShowIf) {
  addAdvancedBooleanSwitch(builder, {
    path: pieStillShowZeroSumPath,
    name: 'Still show zero sum',
    description: 'When every slice is zero, still draw an even pie instead of nothing',
    defaultValue: PIE_STILL_SHOW_ZERO_SUM_DEFAULT,
    showIf,
  });

  addAdvancedBooleanSwitch(builder, {
    path: pieShowEmptyCirclePath,
    name: 'Show empty circle',
    description: 'Draw a placeholder circle when there is no data',
    defaultValue: PIE_SHOW_EMPTY_CIRCLE_DEFAULT,
    showIf,
  });
}
