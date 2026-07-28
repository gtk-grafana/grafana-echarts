import { type PanelOptionsEditorBuilder } from '@grafana/data';
import {
  PERFORMANCE_ANIMATION_DEFAULT,
  PERFORMANCE_DOWNSAMPLING_DEFAULT,
  PERFORMANCE_SHOW_POINTS_DEFAULT,
  performanceAnimationName,
  performanceAnimationPath,
  performanceDownsamplingName,
  performanceDownsamplingPath,
  performanceModeOptions,
  performanceShowPointsName,
  performanceShowPointsPath,
} from 'editor/constants';
import { type PerformanceMode } from 'editor/types';
import { addAdvancedBooleanSwitch, addAdvancedRadio } from 'lib/grafana/editor/common/advanced-options';
import { type PanelOptions } from 'types';

/**
 * Register the Advanced "Performance" options for the cartesian time-series fast
 * path (in the shared "Advanced" category, gated behind Advanced editor mode by
 * the `addAdvanced*` helpers). These override the density-based auto behavior
 * resolved in `lib/echarts/performance/resolvers.ts`:
 *
 * - **Show points** (`performance.showPoints`, default Auto): per-series
 *   `showSymbol`. Auto hides markers on dense line series; Always/Never force it.
 * - **Downsampling** (`performance.downsampling`, default on): LTTB `sampling` on
 *   dense line series (a no-op once points fit the pixels).
 * - **Animation** (`performance.animation`, default Auto): the panel-wide
 *   `animation` flag. A tri-state rather than a switch so Auto is representable —
 *   a boolean whose unset state meant "auto" rendered unchecked while the chart
 *   was in fact animating.
 *
 * Both tri-states share `performanceModeOptions` (Auto / Always / Never) so the
 * two radios read identically in the editor.
 */
export function addPerformanceOptions(builder: PanelOptionsEditorBuilder<PanelOptions>) {
  addAdvancedRadio<PerformanceMode>(builder, {
    path: performanceShowPointsPath,
    name: performanceShowPointsName,
    description: 'Point markers on line series. Auto hides them on dense series to speed up rendering',
    defaultValue: PERFORMANCE_SHOW_POINTS_DEFAULT,
    settings: { options: performanceModeOptions },
  });

  addAdvancedBooleanSwitch(builder, {
    path: performanceDownsamplingPath,
    name: performanceDownsamplingName,
    description: 'Sample dense line series toward pixel resolution (LTTB) to cut drawn points',
    defaultValue: PERFORMANCE_DOWNSAMPLING_DEFAULT,
  });

  addAdvancedRadio<PerformanceMode>(builder, {
    path: performanceAnimationPath,
    name: performanceAnimationName,
    description: 'Animate on load and update. Auto disables animation on large datasets',
    defaultValue: PERFORMANCE_ANIMATION_DEFAULT,
    settings: { options: performanceModeOptions },
  });
}
