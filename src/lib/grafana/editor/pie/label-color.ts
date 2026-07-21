import { type PanelOptionsEditorBuilder } from '@grafana/data';
import { pieLabelColorPath } from 'editor/constants';
import { addAdvancedColorPicker } from 'lib/grafana/editor/common/advanced-options';
import { type PanelOptions } from 'types';

/**
 * Register the Advanced "Label color" pie option (ECharts `label.color`) in the
 * "Advanced" category. Overrides the theme text color applied by `getPieLabelStyle`;
 * unset keeps the theme color.
 */
export function addPieLabelColorOptions(builder: PanelOptionsEditorBuilder<PanelOptions>) {
  addAdvancedColorPicker(builder, {
    path: pieLabelColorPath,
    name: 'Label color',
    description: 'Override the slice-label text color (defaults to the theme text color)',
  });
}
