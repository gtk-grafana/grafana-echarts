import { type PanelOptionsEditorBuilder, type SelectableValue } from '@grafana/data';
import { isGraphVariant } from 'editor/sankey';
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
 *
 * "Link color" is shared by both render variants. The other two are graph-only:
 * `SankeySeriesOption` has no `edgeSymbol` at all (a ribbon carries its direction by
 * shape), and sankey curveness is a separate option because its ECharts default
 * differs — see `addRelationsSankeyOptions`.
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
    showIf: isGraphVariant,
  });

  addAdvancedNumberInput(builder, {
    path: 'relationsCurveness',
    name: 'Link curveness',
    description: 'Curve links (0-1). Separates the two directions of a bidirectional pair',
    showIf: isGraphVariant,
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
