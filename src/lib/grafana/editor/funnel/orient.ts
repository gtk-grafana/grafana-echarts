import { type PanelOptionsEditorBuilder } from '@grafana/data';
import {
  FUNNEL_ORIENT_DEFAULT,
  funnelCategoryName,
  funnelOrientOptions,
  funnelOrientPath,
  isFunnelVariant,
} from 'editor/funnel';
import { type PanelOptions } from 'types';

/**
 * Register the funnel "Orientation" radio (Vertical / Horizontal) in the "Funnel"
 * category, shown whenever the funnel variant is selected (no Advanced-mode gate —
 * the funnel's layout controls are first-class, like the pie's "Pie" category).
 * Maps to `series.orient`; omitted at the vertical default. See `getFunnelOrient`.
 */
export function addFunnelOrientOptions(builder: PanelOptionsEditorBuilder<PanelOptions>) {
  builder.addRadio({
    path: funnelOrientPath,
    name: 'Funnel orientation',
    description: 'Lay the funnel out vertically (stacked) or horizontally',
    category: [funnelCategoryName],
    defaultValue: FUNNEL_ORIENT_DEFAULT,
    settings: { options: funnelOrientOptions },
    showIf: isFunnelVariant,
  });
}
