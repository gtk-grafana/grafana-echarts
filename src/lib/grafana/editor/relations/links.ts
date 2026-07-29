import { type PanelOptionsEditorBuilder, type SelectableValue } from '@grafana/data';
import { type RelationsLinkColor } from 'editor/types';
import { RELATIONS_LINK_COLOR_DEFAULT } from 'lib/echarts/options/graph';
import {
  addAdvancedBooleanSwitch,
  addAdvancedNumberInput,
  addAdvancedSelect,
} from 'lib/grafana/editor/common/advanced-options';
import { type PanelOptions } from 'types';

/**
 * Link (edge) styling options, all Advanced. An explicit per-edge `color` field
 * from the data always wins over the color mode chosen here.
 * https://echarts.apache.org/en/option.html#series-graph.lineStyle
 * https://echarts.apache.org/en/option.html#series-graph.edgeSymbol
 */
const linkColorOptions: Array<SelectableValue<RelationsLinkColor>> = [
  { value: 'source', label: 'Source' },
  { value: 'target', label: 'Target' },
  { value: 'gradient', label: 'Gradient' },
];

export function addRelationsLinkOptions(builder: PanelOptionsEditorBuilder<PanelOptions>): void {
  addAdvancedBooleanSwitch(builder, {
    path: 'relationsEdgeArrows',
    name: 'Edge arrows',
    description: 'Draw an arrowhead at the target end so direction is readable',
  });

  addAdvancedNumberInput(builder, {
    path: 'relationsCurveness',
    name: 'Link curveness',
    description: 'Curve links (0-1). Separates the two directions of a bidirectional pair',
    settings: { min: 0, max: 1, step: 0.05 },
  });

  addAdvancedSelect(builder, {
    path: 'relationsLinkColor',
    name: 'Link color',
    description: 'Which node a link inherits its color from. A per-edge color field overrides this',
    defaultValue: RELATIONS_LINK_COLOR_DEFAULT,
    settings: { options: linkColorOptions },
  });
}
