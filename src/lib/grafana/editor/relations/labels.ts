import { type PanelOptionsEditorBuilder, type SelectableValue } from '@grafana/data';

import { addAdvancedNumberInput, composeShowIf } from 'lib/grafana/editor/common/advanced-options';
import { type PanelOptions } from 'types';

import {
  RELATIONS_HIDE_OVERLAPPING_LABELS_DEFAULT,
  RELATIONS_LABEL_OVERFLOW_DEFAULT,
  RELATIONS_LABEL_WIDTH_DEFAULT,
  RELATIONS_SHOW_NODE_LABELS_DEFAULT,
  RELATIONS_SHOW_NODE_VALUES_DEFAULT,
  relationsLabelsCategoryName,
} from 'editor/relations/constants';
import { hasNoNodeStats } from 'lib/echarts/relations/converters/frameRoles';
import { type RelationsLabelOverflow } from 'editor/relations/types';
/**
 * The "Labels" section: what text a mark carries, and what happens when it does not fit.
 * https://echarts.apache.org/en/option.html#series-graph.label
 */
const labelsCategory = [relationsLabelsCategoryName];

/** Overflow handling. */
const labelOverflowOptions: Array<SelectableValue<RelationsLabelOverflow>> = [
  { value: 'none', label: 'None', description: 'Draw the whole name, however wide' },
  { value: 'truncate', label: 'Truncate', description: 'Ellipsis at the label width' },
  { value: 'break', label: 'Wrap', description: 'Wrap at word boundaries' },
];

/** Check whether node labels are visible. */
const showsNodeLabels = (options: PanelOptions) =>
  (options.relationsShowNodeLabels ?? RELATIONS_SHOW_NODE_LABELS_DEFAULT) !== false;

export function addRelationsLabelOptions(builder: PanelOptionsEditorBuilder<PanelOptions>): void {
  builder.addBooleanSwitch({
    path: 'relationsShowNodeLabels',
    name: 'Show node labels',
    description: 'Draw each node name beside it',
    category: labelsCategory,
    defaultValue: RELATIONS_SHOW_NODE_LABELS_DEFAULT,
  });

  builder.addBooleanSwitch({
    path: 'relationsShowNodeValues',
    name: 'Show node values',
    description: "Add each node's mainstat under its name",
    category: labelsCategory,
    defaultValue: RELATIONS_SHOW_NODE_VALUES_DEFAULT,
    // Show this option only when node values can appear.
    showIf: (options, data) => showsNodeLabels(options) && !hasNoNodeStats(data),
  });

  // Chord has no native equivalent of `avoidLabelOverlap`.
  builder.addBooleanSwitch({
    path: 'relationsHideOverlappingLabels',
    name: 'Hide overlapping labels',
    description: 'Drop a node label that would collide with one already drawn',
    category: labelsCategory,
    defaultValue: RELATIONS_HIDE_OVERLAPPING_LABELS_DEFAULT,
    showIf: showsNodeLabels,
  });

  builder.addSelect({
    path: 'relationsLabelOverflow',
    name: 'Label overflow',
    description: 'How a node name longer than the label width is handled',
    category: labelsCategory,
    defaultValue: RELATIONS_LABEL_OVERFLOW_DEFAULT,
    settings: { options: labelOverflowOptions },
    showIf: showsNodeLabels,
  });

  addAdvancedNumberInput(builder, {
    path: 'relationsLabelWidth',
    name: 'Label width',
    description: 'Width in px at which label overflow handling applies',
    category: labelsCategory,
    defaultValue: RELATIONS_LABEL_WIDTH_DEFAULT,
    settings: { min: 10, max: 400, integer: true },
    showIf: composeShowIf(
      showsNodeLabels,
      (options) => (options.relationsLabelOverflow ?? RELATIONS_LABEL_OVERFLOW_DEFAULT) !== 'none'
    ),
  });
}
