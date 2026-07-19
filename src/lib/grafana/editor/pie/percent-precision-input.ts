import { type PanelOptionsEditorBuilder } from '@grafana/data';
import { PIE_PERCENT_PRECISION_DEFAULT, pieLabelsCategoryName, piePercentPrecisionPath } from 'editor/constants';
import { isAdvancedEditorMode } from 'lib/grafana/editor/common/editor-mode';
import { type PanelOptions } from 'types';

/**
 * Register the Advanced-only pie "Percent decimals" number input controlling the
 * decimal places in the slice percent label (via `sliceShare`). Distinguishes
 * near-equal shares. Placed in the "Labels" category and gated behind Advanced.
 * The default (`1`) reproduces today's `33.3%` output.
 */
export function addPiePercentPrecisionOptions(builder: PanelOptionsEditorBuilder<PanelOptions>) {
  builder.addNumberInput({
    path: piePercentPrecisionPath,
    name: 'Percent decimals',
    category: [pieLabelsCategoryName],
    description: 'Number of decimal places shown in the percent label.',
    defaultValue: PIE_PERCENT_PRECISION_DEFAULT,
    settings: {
      min: 0,
      max: 4,
      integer: true,
    },
    showIf: isAdvancedEditorMode,
  });
}
