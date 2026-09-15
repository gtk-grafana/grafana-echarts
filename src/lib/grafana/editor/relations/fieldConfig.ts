import { type FieldConfigEditorBuilder, type SelectableValue } from '@grafana/data';
import { commonOptionsBuilder } from '@grafana/ui';

import { addRelationsFilterConfig } from 'lib/grafana/editor/relations/filters';

import { type EChartsRelationsFieldConfig, type RelationsLineType } from 'editor/relations/types';
/** Per-mark custom field config for the relations family. */

const NODE_CATEGORY = ['Node'];
const EDGE_CATEGORY = ['Edge'];

/**
 * The three ECharts `lineStyle.type` keywords.
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
    // Fixed layout requires both coordinates on every node.
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

  addRelationsFilterConfig(builder);

  // Marks are fields, so standard visibility overrides apply directly.
  commonOptionsBuilder.addHideFrom(builder);
}
