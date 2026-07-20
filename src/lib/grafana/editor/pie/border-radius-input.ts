import { type PanelOptionsEditorBuilder } from '@grafana/data';
import { PIE_BORDER_RADIUS_DEFAULT, pieBorderRadiusPath, pieTypeCategoryName } from 'editor/constants';
import { addAdvancedNumberInput } from 'lib/grafana/editor/common/advanced-options';
import { type PanelOptions } from 'types';

/**
 * Register the Advanced "Rounded corners" pie option (ECharts
 * `itemStyle.borderRadius`, px) in the plugin-owned "Pie" category. A radius of 0
 * (the default) keeps square corners. Rendered by `getPieBorderRadius` /
 * `getPieItemStyle`.
 */
export function addPieBorderRadiusOptions(builder: PanelOptionsEditorBuilder<PanelOptions>) {
  addAdvancedNumberInput(builder, {
    path: pieBorderRadiusPath,
    name: 'Rounded corners',
    category: pieTypeCategoryName,
    description: 'Round the corners of each slice (px)',
    defaultValue: PIE_BORDER_RADIUS_DEFAULT,
    settings: { min: 0, max: 50 },
  });
}
