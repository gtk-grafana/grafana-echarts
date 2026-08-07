import { type PanelOptionsEditorBuilder, type SelectableValue } from '@grafana/data';
import { isGraphVariant, isSankeyVariant } from 'editor/sankey';
import { type RelationsLinkColor } from 'editor/types';
import {
  RELATIONS_EDGE_ARROWS_DEFAULT,
  RELATIONS_LINK_COLOR_DEFAULT,
  RELATIONS_SHOW_EDGE_VALUES_DEFAULT,
} from 'lib/echarts/options/graph';
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
 * "Link color" is shared by all three render variants. Edge arrows and curveness are
 * graph-only: `SankeySeriesOption` has no `edgeSymbol` at all (a ribbon carries its
 * direction by shape), and sankey curveness is a separate option because its ECharts
 * default differs — see `addRelationsSankeyOptions`. "Show edge values" covers graph
 * and sankey but not chord.
 * https://echarts.apache.org/en/option.html#series-graph.lineStyle
 * https://echarts.apache.org/en/option.html#series-graph.edgeSymbol
 */
const linkColorOptions: Array<SelectableValue<RelationsLinkColor>> = [
  { value: 'source', label: 'Source' },
  { value: 'target', label: 'Target' },
  { value: 'gradient', label: 'Gradient' },
];

export function addRelationsLinkOptions(builder: PanelOptionsEditorBuilder<PanelOptions>): void {
  // On by default: an edge is directed by contract, and on a force layout the
  // arrowhead is the only thing that says which way — the source-to-target gradient
  // cannot be oriented there. See `RELATIONS_EDGE_ARROWS_DEFAULT`.
  addAdvancedBooleanSwitch(builder, {
    path: 'relationsEdgeArrows',
    name: 'Edge arrows',
    description: 'Draw an arrowhead at the target end so direction is readable',
    defaultValue: RELATIONS_EDGE_ARROWS_DEFAULT,
    showIf: isGraphVariant,
  });

  // Graph and sankey only. `ChordEdge` builds no text element at all, so the key
  // would be inert on a chord — see `getRelationsEdgeLabel`.
  addAdvancedBooleanSwitch(builder, {
    path: 'relationsShowEdgeValues',
    name: 'Show edge values',
    description: "Draw each link's weight on the link itself",
    defaultValue: RELATIONS_SHOW_EDGE_VALUES_DEFAULT,
    showIf: (options) => isGraphVariant(options) || isSankeyVariant(options),
  });

  addAdvancedNumberInput(builder, {
    path: 'relationsCurveness',
    name: 'Link curveness',
    description: 'Curve links (0-1). Separates the two directions of a bidirectional pair',
    showIf: isGraphVariant,
    settings: { min: 0, max: 1, step: 0.05 },
  });

  // Gradient by default on every variant. On graph it degrades to the source node's
  // colour when the node positions are not known ahead of layout, since a bbox-relative
  // gradient cannot be oriented then — see `makeEdgeGradientResolver`.
  addAdvancedSelect(builder, {
    path: 'relationsLinkColor',
    name: 'Link color',
    description: 'Which node a link inherits its color from. A per-edge color field overrides this',
    defaultValue: RELATIONS_LINK_COLOR_DEFAULT,
    settings: { options: linkColorOptions },
  });
}
