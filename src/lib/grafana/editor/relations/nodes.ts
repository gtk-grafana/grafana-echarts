import { type PanelOptionsEditorBuilder, type SelectableValue } from '@grafana/data';
import { relationsCategoryName } from 'editor/constants';
import { isGraphVariant } from 'editor/sankey';
import { type RelationsLabelOverflow } from 'editor/types';
import { hasNoNodeStats } from 'lib/echarts/converters/graphWide';
import {
  RELATIONS_HIDE_OVERLAPPING_LABELS_DEFAULT,
  RELATIONS_LABEL_OVERFLOW_DEFAULT,
  RELATIONS_LABEL_WIDTH_DEFAULT,
  RELATIONS_NODE_SIZE_DEFAULT,
  RELATIONS_SHOW_NODE_LABELS_DEFAULT,
  RELATIONS_SHOW_NODE_VALUES_DEFAULT,
} from 'lib/echarts/options/graph';
import { addAdvancedNumberInput, addAdvancedSelect, composeShowIf } from 'lib/grafana/editor/common/advanced-options';
import { type PanelOptions } from 'types';

/**
 * Node presentation options: whether node names and stats are drawn, how a label that
 * does not fit is handled, and the fallback node size. All mirror what a user coming
 * from core Grafana's Node graph panel expects to be able to control.
 *
 * Labels, values and the two overlap controls are shared by every render variant;
 * "Node size" is graph-only, since a sankey node is a rectangle whose thickness is the
 * series-level `nodeWidth` and whose length is its flow — see
 * `addRelationsSankeyOptions`.
 * https://echarts.apache.org/en/option.html#series-graph.label
 * https://echarts.apache.org/en/option.html#series-graph.symbolSize
 */
const labelOverflowOptions: Array<SelectableValue<RelationsLabelOverflow>> = [
  { value: 'none', label: 'None', description: 'Draw the whole name, however wide' },
  { value: 'truncate', label: 'Truncate', description: 'Ellipsis at the label width' },
  { value: 'break', label: 'Wrap', description: 'Wrap at word boundaries' },
  { value: 'breakAll', label: 'Wrap anywhere', description: 'Wrap at any character' },
];

/** Whether node labels are drawn at all — nothing below it means anything if not. */
const showsNodeLabels = (options: PanelOptions) =>
  (options.relationsShowNodeLabels ?? RELATIONS_SHOW_NODE_LABELS_DEFAULT) !== false;

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
    // Two gates. The value rides on the label, so it can only show when the label
    // does; and there has to be a value to show — on an edges-only response every node
    // is derived from an endpoint and carries no stat at all, so the switch would be a
    // control that visibly does nothing. `showIf` is handed the panel's frames for
    // exactly this. See `hasNoNodeStats`.
    showIf: (options, data) => showsNodeLabels(options) && !hasNoNodeStats(data),
  });

  // Default-tier and on: overlapping labels are the first thing that goes wrong on a
  // graph past a handful of nodes, and a half-covered label is worse than none — the
  // node keeps its symbol, its colour and its tooltip either way. This is also the
  // chord variant's answer to the pie's `avoidLabelOverlap`, which `series.chord` has
  // no equivalent of. See `getRelationsLabelLayout`.
  builder.addBooleanSwitch({
    path: 'relationsHideOverlappingLabels',
    name: 'Hide overlapping labels',
    description: 'Drop a node label that would collide with one already drawn',
    category: [relationsCategoryName],
    defaultValue: RELATIONS_HIDE_OVERLAPPING_LABELS_DEFAULT,
    showIf: showsNodeLabels,
  });

  // Advanced, and defaulted to truncate rather than to ECharts' `none`: node names in a
  // topology are routinely long enough to reach the next node, and an ellipsis keeps
  // the first (identifying) part of every one of them readable.
  addAdvancedSelect(builder, {
    path: 'relationsLabelOverflow',
    name: 'Label overflow',
    description: 'How a node name longer than the label width is handled',
    defaultValue: RELATIONS_LABEL_OVERFLOW_DEFAULT,
    settings: { options: labelOverflowOptions },
    showIf: showsNodeLabels,
  });

  addAdvancedNumberInput(builder, {
    path: 'relationsLabelWidth',
    name: 'Label width',
    description: 'Width in px at which label overflow handling applies',
    defaultValue: RELATIONS_LABEL_WIDTH_DEFAULT,
    settings: { min: 10, max: 400, integer: true },
    showIf: composeShowIf(
      showsNodeLabels,
      (options) => (options.relationsLabelOverflow ?? RELATIONS_LABEL_OVERFLOW_DEFAULT) !== 'none'
    ),
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
