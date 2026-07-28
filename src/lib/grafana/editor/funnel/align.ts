import { type PanelOptionsEditorBuilder } from '@grafana/data';
import {
  FUNNEL_ALIGN_DEFAULT,
  funnelAlignOptions,
  funnelAlignPath,
  funnelCategoryName,
  isFunnelVariant,
  isFunnelVertical,
} from 'editor/funnel';
import { type PanelOptions } from 'types';

/**
 * Register the funnel "Alignment" radio (Center / Left / Right) in the "Funnel"
 * category. Maps to `series.funnelAlign` (the horizontal alignment of the
 * narrowing trapezoids); omitted at the center default. Shown only for a vertical
 * funnel — a horizontal funnel only supports center alignment, so the control is
 * hidden and the value is coerced to center at render (see `getFunnelAlign`).
 */
export function addFunnelAlignOptions(builder: PanelOptionsEditorBuilder<PanelOptions>) {
  builder.addRadio({
    path: funnelAlignPath,
    name: 'Funnel alignment',
    description: 'Align the narrowing trapezoids to the center, left, or right',
    category: [funnelCategoryName],
    defaultValue: FUNNEL_ALIGN_DEFAULT,
    settings: { options: funnelAlignOptions },
    showIf: (options) => isFunnelVariant(options) && isFunnelVertical(options),
  });
}
