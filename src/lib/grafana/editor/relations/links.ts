import { type PanelOptionsEditorBuilder } from '@grafana/data';

import { addAdvancedNumberInput } from 'lib/grafana/editor/common/advanced-options';
import { RelationsLinkColorEditor } from 'lib/grafana/editor/relations/RelationsLinkColorEditor';
import { type PanelOptions } from 'types';

import {
  RELATIONS_EDGE_ARROWS_DEFAULT,
  RELATIONS_LINK_COLOR_DEFAULT,
  RELATIONS_SHOW_EDGE_VALUES_DEFAULT,
  relationsEdgesCategoryName,
  relationsLabelsCategoryName,
} from 'editor/relations/constants';
import { isGraphVariant, isSankeyVariant } from 'editor/relations/variants';
/**
 * Edge styling.
 * https://echarts.apache.org/en/option.html#series-graph.lineStyle
 * https://echarts.apache.org/en/option.html#series-graph.edgeSymbol
 */
const edgesCategory = [relationsEdgesCategoryName];

export function addRelationsLinkOptions(builder: PanelOptionsEditorBuilder<PanelOptions>): void {
  builder.addCustomEditor({
    id: 'relationsLinkColor',
    path: 'relationsLinkColor',
    name: 'Link color',
    description: 'Which node a link inherits its color from',
    category: edgesCategory,
    editor: RelationsLinkColorEditor,
    defaultValue: RELATIONS_LINK_COLOR_DEFAULT,
  });

  builder.addBooleanSwitch({
    path: 'relationsEdgeArrows',
    name: 'Edge arrows',
    description: 'Draw an arrowhead at the target end so direction is readable',
    category: edgesCategory,
    defaultValue: RELATIONS_EDGE_ARROWS_DEFAULT,
    showIf: isGraphVariant,
  });

  addAdvancedNumberInput(builder, {
    path: 'relationsCurveness',
    name: 'Link curveness',
    description: 'Curve links (0-1). Separates the two directions of a bidirectional pair',
    category: edgesCategory,
    showIf: isGraphVariant,
    settings: { min: 0, max: 1, step: 0.05 },
  });

  builder.addBooleanSwitch({
    path: 'relationsShowEdgeValues',
    name: 'Show edge values',
    description: "Draw each link's weight on the link itself",
    category: [relationsLabelsCategoryName],
    defaultValue: RELATIONS_SHOW_EDGE_VALUES_DEFAULT,
    showIf: (options) => isGraphVariant(options) || isSankeyVariant(options),
  });
}
