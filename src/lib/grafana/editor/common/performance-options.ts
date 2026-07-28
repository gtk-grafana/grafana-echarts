import { type PanelOptionsEditorBuilder } from '@grafana/data';
import {
  ANIMATION_ENABLED_DEFAULT,
  animationEnabledPath,
  animationName,
  PERFORMANCE_DOWNSAMPLING_DEFAULT,
  PERFORMANCE_SHOW_POINTS_DEFAULT,
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
 *   `showSymbol`, decided from the chart's **total** point count — marker count is
 *   what costs, so many short series are as expensive as one long one. Auto hides
 *   markers once the total crosses the threshold, except on a series that draws no
 *   line and would then render as nothing; Always/Never force it.
 * - **Downsampling** (`performance.downsampling`, default on): arms LTTB
 *   `sampling` on every line series. ECharts itself decides when it fires, gating
 *   on the rendered width, so this is a no-op until a series has more points than
 *   the axis has pixels.
 * - **Animation** (`animation.enabled`, default off): the panel-wide `animation`
 *   flag, an opt-in switch. Density thresholds were tried and removed — they
 *   could not fire before the render that needed them (see `resolveAnimation`) —
 *   so animation is simply off unless asked for. Because off *is* the default, a
 *   plain switch is now unambiguous: what it shows is what the chart does.
 */
export function addPerformanceOptions(builder: PanelOptionsEditorBuilder<PanelOptions>) {
  addAdvancedRadio<PerformanceMode>(builder, {
    path: performanceShowPointsPath,
    name: performanceShowPointsName,
    description: 'Point markers on line series. Auto hides them once the chart has many points in total',
    defaultValue: PERFORMANCE_SHOW_POINTS_DEFAULT,
    settings: { options: performanceModeOptions },
  });

  addAdvancedBooleanSwitch(builder, {
    path: performanceDownsamplingPath,
    name: performanceDownsamplingName,
    description: 'Sample dense line series toward pixel resolution (LTTB) to cut drawn points',
    defaultValue: PERFORMANCE_DOWNSAMPLING_DEFAULT,
  });

  addAdvancedBooleanSwitch(builder, {
    path: animationEnabledPath,
    name: animationName,
    description: 'Animate on load and update. Off by default; costly on large datasets',
    defaultValue: ANIMATION_ENABLED_DEFAULT,
  });
}
