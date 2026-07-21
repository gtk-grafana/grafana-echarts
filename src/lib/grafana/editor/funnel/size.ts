import { type PanelOptionsEditorBuilder } from '@grafana/data';
import { funnelMaxSizePath, funnelMinSizePath, isFunnelVariant } from 'editor/funnel';
import { addAdvancedNumberInput } from 'lib/grafana/editor/common/advanced-options';
import { type PanelOptions } from 'types';

/**
 * Register the funnel "Min size" / "Max size" number inputs (trapezoid extent as
 * a percentage of the layout box) — ECharts-only options in the "Advanced"
 * category, shown only when the funnel variant is selected. Map to
 * `series.minSize` / `series.maxSize`; each unset value falls back to the ECharts
 * default ('0%' / '100%'). See `getFunnelSize`.
 */
export function addFunnelSizeOptions(builder: PanelOptionsEditorBuilder<PanelOptions>) {
  const settings = { min: 0, max: 100, integer: true };

  addAdvancedNumberInput(builder, {
    path: funnelMinSizePath,
    name: 'Min segment size',
    description: 'Smallest segment extent as a percentage of the layout box. Leave empty for 0%.',
    settings,
    showIf: isFunnelVariant,
  });

  addAdvancedNumberInput(builder, {
    path: funnelMaxSizePath,
    name: 'Max segment size',
    description: 'Largest segment extent as a percentage of the layout box. Leave empty for 100%.',
    settings,
    showIf: isFunnelVariant,
  });
}
