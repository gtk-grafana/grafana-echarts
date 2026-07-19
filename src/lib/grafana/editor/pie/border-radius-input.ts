import { type PanelOptionsEditorBuilder } from '@grafana/data';
import { PIE_BORDER_RADIUS_DEFAULT, pieBorderRadiusPath, pieTypeCategoryName } from 'editor/constants';
import { isAdvancedEditorMode } from 'lib/grafana/editor/common/editor-mode';
import { type PanelOptions } from 'types';

/**
 * Register the Advanced "Rounded corners" pie option: the ECharts
 * `itemStyle.borderRadius` (px) applied to each slice. Lives in the plugin-owned
 * "Pie" category, gated behind Advanced (`showIf: isAdvancedEditorMode`). A radius
 * of 0 (the default) keeps square corners. Rendered by `getPieBorderRadius` /
 * `getPieItemStyle`.
 * https://echarts.apache.org/en/option.html#series-pie.itemStyle.borderRadius
 */
export function addPieBorderRadiusOptions(builder: PanelOptionsEditorBuilder<PanelOptions>) {
  builder.addNumberInput({
    path: pieBorderRadiusPath,
    name: 'Rounded corners',
    category: [pieTypeCategoryName],
    description: 'Round the corners of each slice (px)',
    defaultValue: PIE_BORDER_RADIUS_DEFAULT,
    settings: {
      min: 0,
      max: 50,
    },
    showIf: isAdvancedEditorMode,
  });
}
