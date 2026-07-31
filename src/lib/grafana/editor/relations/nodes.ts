import { type PanelOptionsEditorBuilder } from '@grafana/data';
import { relationsCategoryName } from 'editor/constants';
import { isGraphVariant } from 'editor/sankey';
import {
  RELATIONS_NODE_SIZE_DEFAULT,
  RELATIONS_SHOW_NODE_LABELS_DEFAULT,
  RELATIONS_SHOW_NODE_VALUES_DEFAULT,
} from 'lib/echarts/options/graph';
import { type PanelOptions } from 'types';

/**
 * Node presentation options, Default tier: whether node names and stats are drawn,
 * and the fallback node size. All mirror what a user coming from core Grafana's
 * Node graph panel expects to be able to control.
 *
 * Labels and values are shared by every render variant; "Node size" is graph-only,
 * since a sankey node is a rectangle whose thickness is the series-level `nodeWidth`
 * and whose length is its flow — see `addRelationsSankeyOptions`.
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

  builder.addBooleanSwitch({
    path: 'relationsShowNodeValues',
    name: 'Show node values',
    description: "Add each node's mainstat under its name",
    category: [relationsCategoryName],
    defaultValue: RELATIONS_SHOW_NODE_VALUES_DEFAULT,
    // The value rides on the label, so it can only show when the label does.
    showIf: (options) => (options.relationsShowNodeLabels ?? RELATIONS_SHOW_NODE_LABELS_DEFAULT) !== false,
  });

  builder.addSliderInput({
    path: 'relationsNodeSize',
    name: 'Node size',
    description: 'Node diameter in px. Nodes supplying noderadius keep their own size',
    category: [relationsCategoryName],
    defaultValue: RELATIONS_NODE_SIZE_DEFAULT,
    settings: { min: 4, max: 80, step: 1 },
    showIf: isGraphVariant,
  });
}
