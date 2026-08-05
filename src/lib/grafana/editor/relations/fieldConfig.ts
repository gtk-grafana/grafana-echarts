import { type FieldConfigEditorBuilder, type SelectableValue } from '@grafana/data';
import { commonOptionsBuilder } from '@grafana/ui';
import { type EChartsRelationsFieldConfig, type RelationsLineType } from 'editor/types';

/**
 * Per-mark custom field config for the relations family.
 *
 * This is what the whole `graph-*-wide` pivot was for: a mark is a field, so an
 * ordinary Grafana override that names one node or one edge can style it, and the
 * override picker lists every mark by name. The row form could not express any of
 * this — its `noderadius` / `thickness` / `strokedasharray` columns were data, so the
 * only way to change one was to change the query.
 *
 * **Every control is override-only** (`hideFromDefaults: true`). The Fields tab sets a
 * value for *all* fields at once, which here means every node **and** every edge, and
 * none of these properties means anything applied that way: `subtitle` and `fixedX`
 * are per-mark by nature, while node size and edge curveness already have panel-level
 * options that say "all marks" properly (`addRelationsNodeOptions`,
 * `addRelationsLinkOptions`). A default would either duplicate those or be nonsense.
 *
 * Node and edge controls sit in separate categories because a field override cannot
 * know which frame its field came from — both sets are offered for any mark, and the
 * reader ignores the ones that do not apply (`converters/graphWide.ts`).
 */

const NODE_CATEGORY = ['Node'];
const EDGE_CATEGORY = ['Edge'];

/**
 * The three ECharts `lineStyle.type` keywords. Chosen directly instead of inferred
 * from an SVG dash array, which is what the row form's `strokedasharray` forced —
 * see `toLineType` in `converters/legacyToWide.ts`.
 * https://echarts.apache.org/en/option.html#series-graph.lineStyle.type
 */
const lineTypeOptions: Array<SelectableValue<RelationsLineType>> = [
  { value: 'solid', label: 'Solid' },
  { value: 'dashed', label: 'Dashed' },
  { value: 'dotted', label: 'Dotted' },
];

export function addRelationsCustomConfig(builder: FieldConfigEditorBuilder<EChartsRelationsFieldConfig>): void {
  builder
    .addNumberInput({
      path: 'nodeRadius',
      name: 'Node radius',
      description: 'Diameter of this node in px, overriding the panel-level node size',
      category: NODE_CATEGORY,
      hideFromDefaults: true,
      settings: { min: 1, max: 200, step: 1 },
    })
    .addTextInput({
      path: 'subtitle',
      name: 'Subtitle',
      description: "Second line in this node's tooltip",
      category: NODE_CATEGORY,
      hideFromDefaults: true,
    })
    // Pinned coordinates are all-or-nothing: `getGraphLayout` only switches to
    // `layout: 'none'` when *every* node pins both, matching the node-graph spec.
    .addNumberInput({
      path: 'fixedX',
      name: 'Fixed x',
      description: 'Pin this node horizontally. Only applied when every node pins both x and y',
      category: NODE_CATEGORY,
      hideFromDefaults: true,
    })
    .addNumberInput({
      path: 'fixedY',
      name: 'Fixed y',
      description: 'Pin this node vertically. Only applied when every node pins both x and y',
      category: NODE_CATEGORY,
      hideFromDefaults: true,
    })
    .addNumberInput({
      path: 'lineWidth',
      name: 'Line width',
      description: 'Stroke width of this edge in px. Ignored by sankey and chord, whose ribbons are sized by weight',
      category: EDGE_CATEGORY,
      hideFromDefaults: true,
      settings: { min: 0, max: 40, step: 1 },
    })
    .addSelect({
      path: 'lineType',
      name: 'Line type',
      description: 'Stroke pattern for this edge. Ignored by sankey and chord, whose ribbons are filled areas',
      category: EDGE_CATEGORY,
      hideFromDefaults: true,
      settings: { options: lineTypeOptions, isClearable: true },
    })
    .addNumberInput({
      path: 'curveness',
      name: 'Curveness',
      description: 'Curve this edge (0-1), overriding the panel-level link curveness. Graph variant only',
      category: EDGE_CATEGORY,
      hideFromDefaults: true,
      settings: { min: 0, max: 1, step: 0.05 },
    });

  // The real "Hide in area" switches, not the editor-less registration this family
  // used to need. A mark is a field, so a `byName` `custom.hideFrom` override now
  // genuinely targets one node or one edge — and the legend's visibility toggle
  // writes the same property. Read back per mark in `converters/graphWide.ts`.
  commonOptionsBuilder.addHideFrom(builder);
}
