import { type PanelOptionsEditorBuilder } from '@grafana/data';
import { funnelCategoryName, funnelMaxSizePath, funnelMinSizePath, isFunnelVariant } from 'editor/funnel';
import { type PanelOptions } from 'types';

/**
 * Register the funnel "Min size" / "Max size" number inputs (trapezoid extent as a
 * percentage of the layout box) in the "Funnel" category, shown whenever the
 * funnel variant is selected. Map to `series.minSize` / `series.maxSize`; each
 * unset value falls back to the ECharts default ('0%' / '100%'). See
 * `getFunnelSize`.
 */
export function addFunnelSizeOptions(builder: PanelOptionsEditorBuilder<PanelOptions>) {
  const settings = { min: 0, max: 100, integer: true };

  builder.addNumberInput({
    path: funnelMinSizePath,
    name: 'Min segment size',
    description: 'Smallest segment extent as a percentage of the layout box. Leave empty for 0%.',
    category: [funnelCategoryName],
    settings,
    showIf: isFunnelVariant,
  });

  builder.addNumberInput({
    path: funnelMaxSizePath,
    name: 'Max segment size',
    description: 'Largest segment extent as a percentage of the layout box. Leave empty for 100%.',
    category: [funnelCategoryName],
    settings,
    showIf: isFunnelVariant,
  });
}
