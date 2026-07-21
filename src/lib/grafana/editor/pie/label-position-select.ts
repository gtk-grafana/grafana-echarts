import { type PanelOptionsEditorBuilder } from '@grafana/data';
import { PIE_LABEL_POSITION_DEFAULT, pieLabelPositionOptions, pieLabelPositionPath } from 'editor/pie';
import { addAdvancedRadio } from 'lib/grafana/editor/common/advanced-options';
import { type PanelOptions } from 'types';

/**
 * Register the pie "Label position" radio (Outside / Inside / Center) — an
 * ECharts-only, Advanced-gated option in the "Advanced" category. The
 * value threads into `getPieContentLabel` as `label.position`: `outside` draws
 * leader lines (the default), `inside` places labels on the slices, and `center`
 * puts a single readout in the donut hole.
 */
export function addPieLabelPositionOptions(builder: PanelOptionsEditorBuilder<PanelOptions>) {
  addAdvancedRadio(builder, {
    path: pieLabelPositionPath,
    name: 'Label position',
    description: 'Where slice labels render: outside, inside the slice, or the donut center',
    defaultValue: PIE_LABEL_POSITION_DEFAULT,
    settings: { options: pieLabelPositionOptions },
  });
}
