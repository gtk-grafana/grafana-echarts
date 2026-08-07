import { type PanelOptionsEditorBuilder } from '@grafana/data';
import {
  animationEnabledPath,
  animationName,
  relationsCategoryName,
  RELATIONS_ANIMATION_ENABLED_DEFAULT,
} from 'editor/constants';
import { type PanelOptions } from 'types';

/**
 * The relations family's "Animation" switch: same shared `animation.enabled` flag every
 * other family writes, but **Default-tier and on**, where the others register it as an
 * Advanced opt-in (`addAnimationOption`).
 *
 * Both differences come from the same fact. The shared default is off because animating
 * a dense chart costs more than it is worth, and "dense" for the other families means
 * tens of thousands of points; a relations mark is a whole *field*, so the same panel is
 * tens of marks. What the animation buys is worth more too — arcs and ribbons growing
 * into place is how a chord or a sankey reads as one connected flow. See
 * `RELATIONS_ANIMATION_ENABLED_DEFAULT` and `resolveAnimation`, which applies the
 * family default at render time so a panel that never touched the switch also animates.
 *
 * The force graph's settling is **not** this flag — that is `force.layoutAnimation`,
 * registered separately by `addRelationsForceOptions` and off by default.
 */
export function addRelationsAnimationOption(builder: PanelOptionsEditorBuilder<PanelOptions>): void {
  builder.addBooleanSwitch({
    path: animationEnabledPath,
    name: animationName,
    description: 'Animate on load and update',
    category: [relationsCategoryName],
    defaultValue: RELATIONS_ANIMATION_ENABLED_DEFAULT,
  });
}
