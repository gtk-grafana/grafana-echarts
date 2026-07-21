import { type PanelOptionsEditorBuilder } from '@grafana/data';
import { FUNNEL_ORIENT_DEFAULT, funnelOrientOptions, funnelOrientPath, isFunnelVariant } from 'editor/funnel';
import { addAdvancedRadio } from 'lib/grafana/editor/common/advanced-options';
import { type PanelOptions } from 'types';

/**
 * Register the funnel "Orientation" radio (Vertical / Horizontal) — an
 * ECharts-only option in the "Advanced" category, shown only when the funnel
 * variant is selected. Maps to `series.orient`; omitted at the vertical default.
 * See `getFunnelOrient`.
 */
export function addFunnelOrientOptions(builder: PanelOptionsEditorBuilder<PanelOptions>) {
  addAdvancedRadio(builder, {
    path: funnelOrientPath,
    name: 'Funnel orientation',
    description: 'Lay the funnel out vertically (stacked) or horizontally',
    defaultValue: FUNNEL_ORIENT_DEFAULT,
    settings: { options: funnelOrientOptions },
    showIf: isFunnelVariant,
  });
}
