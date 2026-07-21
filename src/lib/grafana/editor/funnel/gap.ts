import { type PanelOptionsEditorBuilder } from '@grafana/data';
import { FUNNEL_GAP_DEFAULT, funnelGapPath, isFunnelVariant } from 'editor/funnel';
import { addAdvancedNumberInput } from 'lib/grafana/editor/common/advanced-options';
import { type PanelOptions } from 'types';

/**
 * Register the funnel "Gap" number input (px between trapezoids) — an
 * ECharts-only option in the "Advanced" category, shown only when the funnel
 * variant is selected. Maps to `series.gap`; omitted at the default 0. See
 * `getFunnelGap`.
 */
export function addFunnelGapOptions(builder: PanelOptionsEditorBuilder<PanelOptions>) {
  addAdvancedNumberInput(builder, {
    path: funnelGapPath,
    name: 'Segment gap',
    description: 'Gap (px) between funnel segments',
    defaultValue: FUNNEL_GAP_DEFAULT,
    settings: { min: 0, max: 20, integer: true },
    showIf: isFunnelVariant,
  });
}
