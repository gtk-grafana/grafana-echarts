import { type PanelOptionsEditorBuilder } from '@grafana/data';
import { addAdvancedBooleanSwitch } from 'lib/grafana/editor/common/advanced-options';
import { type PanelOptions } from 'types';

/**
 * Shared panel option path for the animation toggle. Reuses the existing
 * `@internal animation.enabled` shape on `PanelOptions`, read in
 * `buildPanelChartOption`. Common to pie / cartesian / radar.
 */
export const animationEnabledPath = 'animation.enabled';
/** Default animation state: enabled (matches ECharts). */
export const ANIMATION_ENABLED_DEFAULT = true;

/**
 * Register the Advanced-gated "Animation" switch (on/off) common to the chart
 * families. Animates the chart on load and update; defaults on to match ECharts,
 * so Default editor mode restores animation via each family's `ADVANCED_*_DEFAULTS`.
 */
export function addAnimationOption(builder: PanelOptionsEditorBuilder<PanelOptions>): void {
  addAdvancedBooleanSwitch(builder, {
    path: animationEnabledPath,
    name: 'Animation',
    description: 'Animate the chart on load and update',
    defaultValue: ANIMATION_ENABLED_DEFAULT,
  });
}
