import { type PanelOptionsEditorBuilder } from '@grafana/data';
import { ANIMATION_ENABLED_DEFAULT, animationEnabledPath, animationName } from 'editor/constants';
import { addAdvancedBooleanSwitch, type ExtraShowIf } from 'lib/grafana/editor/common/advanced-options';
import { type PanelOptions } from 'types';

/**
 * Register the Advanced-gated "Animation" switch for the families that have no
 * per-point fast path of their own (part-to-whole, multivariate, relations). Cartesian gets
 * the same switch from `addPerformanceOptions`, alongside the line-series levers
 * (Show points / Downsampling) that only apply there — so a family registers one
 * or the other, never both.
 *
 * Path, label and default all come from `editor/constants`, so this switch writes
 * the same shared `animation.enabled` flag that `resolveAnimation` reads at render
 * time. **Off by default:** see `ANIMATION_ENABLED_DEFAULT` and
 * `docs/performance.md` for why density thresholds were replaced by a plain opt-in.
 *
 * Both fields are optional. `category` defaults to the shared "Advanced" section;
 * relations passes its own "Layout" section, since it groups options by purpose rather
 * than by tier.
 *
 * `showIf` exists because **this flag is not honoured by every ECharts series**, and a
 * switch that draws nothing is worse than no switch. Whether the root `animation` does
 * anything is up to the series' view: `SankeyView` gates a clip-path reveal on
 * `seriesModel.isAnimationEnabled()` and `ChordView` enters its group through
 * `graphic.initProps`, so both animate — but `GraphView` writes node and edge positions
 * straight through `SymbolDraw.updateLayout` / `LineDraw.updateLayout` and consults the
 * flag nowhere, so a graph is unaffected by it. Measured, not inferred: with the flag on,
 * a sankey paints ~64 frames over ~1s and a chord ~21, while a graph paints the same 2
 * frames either way. A family with such a series passes a predicate to hide it there.
 */
export function addAnimationOption(
  builder: PanelOptionsEditorBuilder<PanelOptions>,
  { category, showIf }: { category?: string[]; showIf?: ExtraShowIf } = {}
): void {
  addAdvancedBooleanSwitch(builder, {
    path: animationEnabledPath,
    name: animationName,
    description: 'Animate on load and update. Off by default; costly on large datasets',
    defaultValue: ANIMATION_ENABLED_DEFAULT,
    category,
    showIf,
  });
}
