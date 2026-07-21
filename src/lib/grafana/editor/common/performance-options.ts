import { type PanelOptionsEditorBuilder } from '@grafana/data';
import {
  animationName,
  animationEnabledPath,
  PERFORMANCE_DOWNSAMPLING_DEFAULT,
  PERFORMANCE_SHOW_POINTS_DEFAULT,
  performanceDownsamplingName,
  performanceDownsamplingPath,
  performanceShowPointsName,
  performanceShowPointsOptions,
  performanceShowPointsPath,
} from 'editor/constants';
import { type ShowPointsMode } from 'editor/types';
import { addAdvancedBooleanSwitch, addAdvancedRadio } from 'lib/grafana/editor/common/advanced-options';
import { type PanelOptions } from 'types';

/**
 * Register the Advanced "Performance" options for the cartesian time-series fast
 * path (in the shared "Advanced" category, gated behind Advanced editor mode by
 * the `addAdvanced*` helpers). These override the density-based auto behavior
 * resolved in `lib/echarts/options/performance.ts`:
 *
 * - **Show points** (`performance.showPoints`, default Auto): per-series
 *   `showSymbol`. Auto hides markers on dense line series; Always/Never force it.
 * - **Downsampling** (`performance.downsampling`, default on): LTTB `sampling` on
 *   dense line series (a no-op once points fit the pixels).
 * - **Animation** (`animation.enabled`): deliberately has **no** default so the
 *   option stays unset until the user toggles it — that keeps `resolveAnimation`'s
 *   auto path (animation off on dense charts) reachable. An explicit toggle then
 *   overrides the auto decision.
 */
export function addPerformanceOptions(builder: PanelOptionsEditorBuilder<PanelOptions>) {
  addAdvancedRadio<ShowPointsMode>(builder, {
    path: performanceShowPointsPath,
    name: performanceShowPointsName,
    description: 'Point markers on line series. Auto hides them on dense series to speed up rendering',
    defaultValue: PERFORMANCE_SHOW_POINTS_DEFAULT,
    settings: { options: performanceShowPointsOptions },
  });

  addAdvancedBooleanSwitch(builder, {
    path: performanceDownsamplingPath,
    name: performanceDownsamplingName,
    description: 'Sample dense line series toward pixel resolution (LTTB) to cut drawn points',
    defaultValue: PERFORMANCE_DOWNSAMPLING_DEFAULT,
  });

  // No defaultValue: leaving `animation.enabled` unset preserves the auto path
  // (animation auto-disables on dense charts); toggling it sets an explicit
  // override that `resolveAnimation` honors. See `addPerformanceOptions` docs.
  addAdvancedBooleanSwitch(builder, {
    path: animationEnabledPath,
    name: animationName,
    description: 'Animate on load and update. Unset = automatic (disabled on large datasets)',
  });
}
