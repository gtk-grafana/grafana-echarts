import { type PanelOptionsEditorBuilder } from '@grafana/data';
import { FUNNEL_ALIGN_DEFAULT, funnelAlignOptions, funnelAlignPath, isFunnelVariant } from 'editor/funnel';
import { addAdvancedRadio } from 'lib/grafana/editor/common/advanced-options';
import { type PanelOptions } from 'types';

/**
 * Register the funnel "Alignment" radio (Center / Left / Right) — an ECharts-only
 * option in the "Advanced" category, shown only when the funnel variant is
 * selected. Maps to `series.funnelAlign` (the horizontal alignment of the
 * narrowing trapezoids for the vertical orient); omitted at the center default.
 * See `getFunnelAlign`.
 */
export function addFunnelAlignOptions(builder: PanelOptionsEditorBuilder<PanelOptions>) {
  addAdvancedRadio(builder, {
    path: funnelAlignPath,
    name: 'Funnel alignment',
    description: 'Align the narrowing trapezoids to the center, left, or right',
    defaultValue: FUNNEL_ALIGN_DEFAULT,
    settings: { options: funnelAlignOptions },
    showIf: isFunnelVariant,
  });
}
