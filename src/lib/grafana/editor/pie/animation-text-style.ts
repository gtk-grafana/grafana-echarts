import { type PanelOptionsEditorBuilder } from '@grafana/data';
import {
  PIE_ANIMATION_ENABLED_DEFAULT,
  PIE_LABEL_TEXT_SHADOW_DEFAULT,
  PIE_LABEL_TEXT_STROKE_DEFAULT,
  pieAnimationEnabledPath,
  pieLabelsCategoryName,
  pieLabelTextShadowPath,
  pieLabelTextStrokePath,
  pieTypeCategoryName,
} from 'editor/constants';
import { addAdvancedBooleanSwitch } from 'lib/grafana/editor/common/advanced-options';
import { type PanelOptions } from 'types';

/**
 * Register the Advanced "Animation & text style" pie options (lowest priority):
 * the animation toggle (reusing the existing `@internal animation.enabled` shape,
 * consumed by `buildPanelChartOption`) in the "Pie" category, plus the label
 * text-shadow / text-stroke re-enable switches in the "Labels" category. The text
 * switches re-enable the ECharts label shadow/stroke that `getPieLabelStyle`
 * zeroes by default.
 */
export function addPieAnimationTextStyleOptions(builder: PanelOptionsEditorBuilder<PanelOptions>) {
  addAdvancedBooleanSwitch(builder, {
    path: pieAnimationEnabledPath,
    name: 'Animation',
    category: pieTypeCategoryName,
    description: 'Animate the pie on load and update',
    defaultValue: PIE_ANIMATION_ENABLED_DEFAULT,
  });

  addAdvancedBooleanSwitch(builder, {
    path: pieLabelTextShadowPath,
    name: 'Label text shadow',
    category: pieLabelsCategoryName,
    description: 'Draw a drop shadow behind slice labels',
    defaultValue: PIE_LABEL_TEXT_SHADOW_DEFAULT,
  });

  addAdvancedBooleanSwitch(builder, {
    path: pieLabelTextStrokePath,
    name: 'Label text stroke',
    category: pieLabelsCategoryName,
    description: 'Draw a contrast stroke around slice-label text',
    defaultValue: PIE_LABEL_TEXT_STROKE_DEFAULT,
  });
}
