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
 *
 * "Show node labels" and "how a label that doesn't fit is handled" are one subject, so
 * these five controls are one section spanning both tiers — only "Label width" is
 * Advanced. "Show edge values" belongs to the same subject and is registered into this
 * category by `addRelationsLinkOptions`, which owns the rest of the edge controls.
 *
 * Node *size* is not here: it is where a mark sits and how big it is, which is the
 * Layout section's subject. See `addRelationsLayoutOptions`.
 * https://echarts.apache.org/en/option.html#series-graph.label
 */
const labelsCategory = [relationsLabelsCategoryName];

/**
 * Overflow handling. **No `breakAll` ("Wrap anywhere").** It is ECharts' break-at-any-
 * character mode, which on the identifier-shaped names a topology carries — `checkout`,
 * `api-gateway`, `db-primary` — splits mid-word and costs more legibility than the
 * truncation it replaces. The value stays in `RelationsLabelOverflow` and in the ECharts
 * resolver so a panel already saved with it keeps rendering; it is only off the menu.
 */
const labelOverflowOptions: Array<SelectableValue<RelationsLabelOverflow>> = [
  { value: 'none', label: 'None', description: 'Draw the whole name, however wide' },
  { value: 'truncate', label: 'Truncate', description: 'Ellipsis at the label width' },
  { value: 'break', label: 'Wrap', description: 'Wrap at word boundaries' },
];

/** Whether node labels are drawn at all — nothing below it means anything if not. */
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
    category: labelsCategory,
    defaultValue: RELATIONS_HIDE_OVERLAPPING_LABELS_DEFAULT,
    showIf: showsNodeLabels,
  });

  /**
   * Default-tier, and defaulted to truncate rather than to ECharts' `none`: node names
   * in a topology are routinely long enough to reach the next node, and an ellipsis
   * keeps the first (identifying) part of every one of them readable.
   *
   * It was Advanced, which was the wrong tier for the same reason "Hide overlapping
   * labels" is not: on any real topology the labels do not fit, so how they are handled
   * is a first question, not an expert one.
   */
  builder.addSelect({
    path: 'relationsLabelOverflow',
    name: 'Label overflow',
    description: 'How a node name longer than the label width is handled',
    category: labelsCategory,
    defaultValue: RELATIONS_LABEL_OVERFLOW_DEFAULT,
    settings: { options: labelOverflowOptions },
    showIf: showsNodeLabels,
  });

  // Advanced: the *px* at which the mode above bites is a tuning number, unlike the
  // choice of mode. Hidden under `none`, which has no width to bite at.
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
