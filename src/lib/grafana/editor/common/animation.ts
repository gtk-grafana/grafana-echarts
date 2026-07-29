import { type PanelOptionsEditorBuilder } from '@grafana/data';
import { ANIMATION_ENABLED_DEFAULT, animationEnabledPath, animationName } from 'editor/constants';
import { addAdvancedBooleanSwitch } from 'lib/grafana/editor/common/advanced-options';
import { type PanelOptions } from 'types';

/**
 * Register the Advanced-gated "Animation" switch for the families that have no
 * per-point fast path of their own (part-to-whole, multivariate). Cartesian gets
 * the same switch from `addPerformanceOptions`, alongside the line-series levers
 * (Show points / Downsampling) that only apply there — so a family registers one
 * or the other, never both.
 *
 * Path, label and default all come from `editor/constants`, so this switch writes
 * the same shared `animation.enabled` flag that `resolveAnimation` reads at render
 * time. **Off by default:** see `ANIMATION_ENABLED_DEFAULT` and
 * `docs/performance.md` for why density thresholds were replaced by a plain opt-in.
 */
export function addAnimationOption(builder: PanelOptionsEditorBuilder<PanelOptions>): void {
  addAdvancedBooleanSwitch(builder, {
    path: animationEnabledPath,
    name: animationName,
    description: 'Animate on load and update. Off by default; costly on large datasets',
    defaultValue: ANIMATION_ENABLED_DEFAULT,
  });
}
