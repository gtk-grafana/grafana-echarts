import { type PanelOptionsEditorBuilder } from '@grafana/data';
import { relationsCategoryName } from 'editor/constants';
import { RELATIONS_NODE_SIZE_DEFAULT, RELATIONS_SHOW_NODE_LABELS_DEFAULT } from 'lib/echarts/options/graph';
import { type PanelOptions } from 'types';

/**
 * Node presentation options, Default tier: whether node names are drawn, and the
 * fallback node size. Both mirror what a user coming from core Grafana's Node
 * graph panel expects to be able to control.
 * https://echarts.apache.org/en/option.html#series-graph.label
 * https://echarts.apache.org/en/option.html#series-graph.symbolSize
 */
export function addRelationsNodeOptions(builder: PanelOptionsEditorBuilder<PanelOptions>): void {
  builder.addBooleanSwitch({
    path: 'relationsShowNodeLabels',
    name: 'Show node labels',
    description: 'Draw each node name beside it',
    category: [relationsCategoryName],
    defaultValue: RELATIONS_SHOW_NODE_LABELS_DEFAULT,
  });

  builder.addSliderInput({
    path: 'relationsNodeSize',
    name: 'Node size',
    description: 'Node diameter in px. Nodes supplying noderadius keep their own size',
    category: [relationsCategoryName],
    defaultValue: RELATIONS_NODE_SIZE_DEFAULT,
    settings: { min: 4, max: 80, step: 1 },
  });
}
