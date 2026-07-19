import { type PanelOptionsEditorBuilder } from '@grafana/data';
import { pieLabelColorPath, pieLabelsCategoryName } from 'editor/constants';
import { isAdvancedEditorMode } from 'lib/grafana/editor/common/editor-mode';
import { type PanelOptions } from 'types';

/**
 * Register the Advanced "Label color" pie option: an ECharts `label.color` that
 * overrides the theme text color applied by `getPieLabelStyle`. Lives in the
 * plugin-owned "Labels" category, gated behind Advanced
 * (`showIf: isAdvancedEditorMode`). Unset keeps the theme color.
 *
 * First repo use of `addColorPicker` (value type `string`); it is part of the
 * `@grafana/data` `PanelOptionsEditorBuilder`, so no fallback is needed.
 * https://echarts.apache.org/en/option.html#series-pie.label.color
 */
export function addPieLabelColorOptions(builder: PanelOptionsEditorBuilder<PanelOptions>) {
  builder.addColorPicker({
    path: pieLabelColorPath,
    name: 'Label color',
    category: [pieLabelsCategoryName],
    description: 'Override the slice-label text color (defaults to the theme text color)',
    showIf: isAdvancedEditorMode,
  });
}
