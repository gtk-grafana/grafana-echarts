import { type PanelOptionsEditorBuilder } from '@grafana/data';
import {
  FUNNEL_LABEL_POSITION_DEFAULT,
  FUNNEL_LABEL_POSITION_HORIZONTAL_DEFAULT,
  funnelCategoryName,
  funnelLabelPositionHorizontalOptions,
  funnelLabelPositionPath,
  funnelLabelPositionVerticalOptions,
  isFunnelHorizontal,
  isFunnelVariant,
  isFunnelVertical,
} from 'editor/funnel';
import { type PanelOptions } from 'types';

/**
 * Register the funnel "Label position" radio in the "Funnel" category. The offered
 * placements depend on the orientation, so this registers two radios sharing the
 * `funnelLabelPosition` path with mutually exclusive `showIf` gates — only one is
 * ever visible: a vertical funnel offers Left / Right / Inside, a horizontal one
 * Top / Bottom / Center. (Panel options bind by path, so both radios read and write
 * the same stored value.) Maps to `label.position`; the on-trapezoid placements
 * (`inside` / `center`) get a per-slice contrast color at render — see
 * `getFunnelLabel` and `resolveFunnelLabelColor`. The label content
 * (Name / Value / Percent) comes from the shared "Labels" option.
 */
export function addFunnelLabelPositionOptions(builder: PanelOptionsEditorBuilder<PanelOptions>) {
  // Horizontal orient: labels sit on the segment (Center) or outside above/below.
  builder.addRadio({
    path: funnelLabelPositionPath,
    name: 'Funnel label position',
    description: 'Where slice labels render: on the segment (Center), or outside above/below (Top/Bottom)',
    category: [funnelCategoryName],
    defaultValue: FUNNEL_LABEL_POSITION_HORIZONTAL_DEFAULT,
    settings: { options: funnelLabelPositionHorizontalOptions },
    showIf: (options) => isFunnelVariant(options) && isFunnelHorizontal(options),
  });

  // Vertical orient (the default): its default 'inside' is registered last so it
  // stands as the option's overall default value (see PanelPlugin `defaults`).
  builder.addRadio({
    path: funnelLabelPositionPath,
    name: 'Funnel label position',
    description: 'Where slice labels render: on the segment (Inside), or outside to the left/right',
    category: [funnelCategoryName],
    defaultValue: FUNNEL_LABEL_POSITION_DEFAULT,
    settings: { options: funnelLabelPositionVerticalOptions },
    showIf: (options) => isFunnelVariant(options) && isFunnelVertical(options),
  });
}
