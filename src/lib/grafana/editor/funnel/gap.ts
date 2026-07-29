import { type PanelOptionsEditorBuilder } from '@grafana/data';
import { FUNNEL_GAP_DEFAULT, funnelCategoryName, funnelGapPath, isFunnelVariant } from 'editor/funnel';
import { type PanelOptions } from 'types';

/**
 * Register the funnel "Segment gap" number input (px between trapezoids) in the
 * "Funnel" category, shown whenever the funnel variant is selected. Maps to
 * `series.gap`; omitted at the default 0. See `getFunnelGap`.
 */
export function addFunnelGapOptions(builder: PanelOptionsEditorBuilder<PanelOptions>) {
  builder.addNumberInput({
    path: funnelGapPath,
    name: 'Segment gap',
    description: 'Gap (px) between funnel segments',
    category: [funnelCategoryName],
    defaultValue: FUNNEL_GAP_DEFAULT,
    settings: { min: 0, max: 20, integer: true },
    showIf: isFunnelVariant,
  });
}
